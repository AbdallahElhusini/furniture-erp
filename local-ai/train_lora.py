from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import platform
import random
import sys
import time
from pathlib import Path
from typing import Any

import peft
import torch
import transformers
from peft import LoraConfig, PeftModel, get_peft_model
from torch.utils.data import DataLoader, Dataset
from torch.nn.utils.rnn import pad_sequence
from transformers import AutoModelForCausalLM, AutoTokenizer

from base_model_provenance import (
    PINNED_BASE_MODEL,
    download_base_model_provenance,
)
from contract import MODEL_ENABLED_KINDS, REGISTERED_KINDS, contract_metadata, validate_envelope
from prompt import build_base_system_prompt, prompt_sha256
from sampling import (
    ABSTENTION_BUCKET,
    BALANCED_POLICY,
    MULTI_ACTION_BUCKET,
    SAMPLING_POLICIES,
    natural_only_rows,
    sample_rows,
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value.get("prompt"), list) or not isinstance(value.get("completion"), list):
                raise ValueError(f"Invalid row at {path}:{line_number}")
            rows.append(value)
    return rows


def prepare_output_directory(path: Path) -> None:
    if path.exists():
        if not path.is_dir():
            raise ValueError(f"Training output path exists and is not a directory: {path}")
        if any(path.iterdir()):
            raise ValueError(
                "Training output directory must be empty; use a new artifact path instead of "
                f"overwriting existing evidence: {path}"
            )
        return
    path.mkdir(parents=True, exist_ok=False)


def row_kinds(row: dict[str, Any]) -> set[str]:
    try:
        completion = json.loads(row["completion"][0]["content"])
        return {
            action["kind"] for action in completion.get("actions", [])
            if isinstance(action, dict) and isinstance(action.get("kind"), str)
        }
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return set()


def validate_training_rows(rows: list[dict[str, Any]], allowed_kinds: set[str] | frozenset[str]) -> tuple[set[str], str]:
    dataset_kinds: set[str] = set()
    prompt_hashes: set[str] = set()
    for index, row in enumerate(rows, 1):
        try:
            source = row["prompt"][-1]["content"]
            system_prompt = row["prompt"][0]["content"]
            completion = json.loads(row["completion"][0]["content"])
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise ValueError(f"Invalid training row {index}") from error
        if not isinstance(source, str) or not isinstance(system_prompt, str):
            raise ValueError(f"Invalid prompt text in training row {index}")
        errors = validate_envelope(
            completion,
            allowed_kinds=allowed_kinds,
            source=source,
            require_nonempty=True,
        )
        if errors:
            raise ValueError(f"Training row {index} violates the active contract: {'; '.join(errors)}")
        dataset_kinds.update(row_kinds(row))
        prompt_hashes.add(prompt_sha256(system_prompt))
    expected_prompt = build_base_system_prompt(allowed_kinds)
    expected_hash = prompt_sha256(expected_prompt)
    if prompt_hashes != {expected_hash}:
        raise ValueError(
            "Training rows contain prompt drift: "
            f"expected {expected_hash}, observed {sorted(prompt_hashes)}"
        )
    return dataset_kinds, expected_hash


def resume_manifest(
    path: Path,
    *,
    expected_prompt_hash: str,
    expected_base_model: str,
    expected_base_model_revision: str,
    expected_base_model_files_sha256: dict[str, str],
    expected_base_model_artifact_sha256: str,
    allow_legacy: bool,
) -> tuple[dict[str, Any] | None, set[str]]:
    manifest_path = path / "hatab-training-manifest.json"
    if not manifest_path.is_file():
        if allow_legacy:
            return None, set()
        raise ValueError(f"Resume adapter is missing its training manifest: {manifest_path}")
    value = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Resume adapter manifest must be an object: {manifest_path}")
    base_provenance_errors: list[str] = []
    if value.get("baseModel") != expected_base_model:
        base_provenance_errors.append("baseModel")
    if value.get("baseModelRevision") != expected_base_model_revision:
        base_provenance_errors.append("baseModelRevision")
    if value.get("baseModelFilesSha256") != expected_base_model_files_sha256:
        base_provenance_errors.append("baseModelFilesSha256")
    if value.get("baseModelArtifactSha256") != expected_base_model_artifact_sha256:
        base_provenance_errors.append("baseModelArtifactSha256")
    if base_provenance_errors:
        raise ValueError(
            "Resume adapter is not bound to the approved pinned base snapshot: "
            + ", ".join(base_provenance_errors)
        )
    metadata = contract_metadata()
    compatibility_errors: list[str] = []
    if value.get("contractSha256") != metadata["contractSha256"]:
        compatibility_errors.append("contractSha256")
    if value.get("promptSha256") != expected_prompt_hash:
        compatibility_errors.append("promptSha256")
    kinds = value.get("datasetKinds")
    if not isinstance(kinds, list) or not all(isinstance(kind, str) for kind in kinds):
        compatibility_errors.append("datasetKinds")
        inherited: set[str] = set()
    else:
        inherited = set(kinds)
        if not inherited.issubset(REGISTERED_KINDS):
            compatibility_errors.append("datasetKinds.unregistered")
    if compatibility_errors and not allow_legacy:
        raise ValueError(
            "Resume adapter is not compatible with the active contract: " + ", ".join(compatibility_errors)
        )
    return value, inherited


class IntentDataset(Dataset[dict[str, torch.Tensor]]):
    def __init__(self, rows: list[dict[str, Any]], tokenizer: Any, max_length: int):
        self.items: list[dict[str, torch.Tensor]] = []
        self.skipped_too_long = 0
        self.skipped_no_labels = 0
        self.max_observed_tokens = 0
        for row in rows:
            prompt_text = tokenizer.apply_chat_template(
                row["prompt"], tokenize=False, add_generation_prompt=True, enable_thinking=False
            )
            full_text = tokenizer.apply_chat_template(
                row["prompt"] + row["completion"],
                tokenize=False,
                add_generation_prompt=False,
                enable_thinking=False,
            )
            full_ids = tokenizer(full_text, add_special_tokens=False)["input_ids"]
            self.max_observed_tokens = max(self.max_observed_tokens, len(full_ids))
            if len(full_ids) > max_length:
                self.skipped_too_long += 1
                continue
            encoded = tokenizer(
                full_text,
                max_length=max_length,
                truncation=True,
                # The loader uses batch_size=1, so fixed max-length padding only
                # wastes CPU on hundreds of pad tokens. Keep each sample at its
                # real length; the explicit pre-check above still rejects rows
                # that would require truncation.
                padding=False,
                add_special_tokens=False,
                return_tensors="pt",
            )
            prompt_ids = tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
            input_ids = encoded["input_ids"][0]
            attention_mask = encoded["attention_mask"][0]
            labels = input_ids.clone()
            labels[: min(len(prompt_ids), max_length)] = -100
            labels[attention_mask == 0] = -100
            if int((labels != -100).sum()) == 0:
                self.skipped_no_labels += 1
                continue
            self.items.append({
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "labels": labels,
            })

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        return self.items[index]


def collate_intent_batch(
    batch: list[dict[str, torch.Tensor]],
    *,
    pad_token_id: int,
) -> dict[str, torch.Tensor]:
    """Right-pad only to the longest sequence in this batch, never to max_length."""
    return {
        "input_ids": pad_sequence(
            [item["input_ids"] for item in batch],
            batch_first=True,
            padding_value=pad_token_id,
        ),
        "attention_mask": pad_sequence(
            [item["attention_mask"] for item in batch],
            batch_first=True,
            padding_value=0,
        ),
        "labels": pad_sequence(
            [item["labels"] for item in batch],
            batch_first=True,
            padding_value=-100,
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="CPU-safe LoRA tuning for the private HATAB ERP extractor")
    parser.add_argument("--base-model", default=PINNED_BASE_MODEL)
    parser.add_argument("--train", type=Path, default=Path(__file__).parent / "data" / "train.jsonl")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(r"D:\hatab-local-ai\artifacts\qwen3-0.6b-hatab-lora-candidate-v3-pinned-c1899de2"),
    )
    parser.add_argument("--max-length", type=int, default=768)
    parser.add_argument("--max-steps", type=int, default=40)
    parser.add_argument("--gradient-accumulation", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--seed", type=int, default=260901)
    parser.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 4) - 1))
    parser.add_argument("--resume-adapter", type=Path)
    parser.add_argument("--kinds", default="")
    parser.add_argument("--natural-only", action="store_true")
    parser.add_argument(
        "--gradient-checkpointing",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Use activation checkpointing (default). Pass --no-gradient-checkpointing only for a measured alternative profile.",
    )
    parser.add_argument("--allow-disabled", action="store_true")
    parser.add_argument("--allow-legacy-resume", action="store_true")
    parser.add_argument("--sampling-policy", choices=SAMPLING_POLICIES, default=BALANCED_POLICY)
    parser.add_argument("--abstention-weight", type=int, default=1)
    parser.add_argument("--multi-action-weight", type=int, default=1)
    args = parser.parse_args()

    if args.max_steps < 1 or args.gradient_accumulation < 1 or args.batch_size < 1:
        raise ValueError("max-steps, gradient-accumulation, and batch-size must be positive")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(args.threads)
    prepare_output_directory(args.output)
    base_model_provenance = download_base_model_provenance(args.base_model)
    base_model_revision = base_model_provenance["baseModelRevision"]

    rows = read_jsonl(args.train.resolve())
    selected_kinds = {value.strip() for value in args.kinds.split(",") if value.strip()}
    allowed_kinds = REGISTERED_KINDS if args.allow_disabled else MODEL_ENABLED_KINDS
    unknown = selected_kinds - REGISTERED_KINDS
    disabled = selected_kinds - allowed_kinds
    if unknown:
        raise ValueError(f"Requested unregistered kinds: {sorted(unknown)}")
    if disabled:
        raise ValueError(f"Requested model-disabled kinds without --allow-disabled: {sorted(disabled)}")
    if selected_kinds:
        rows = [row for row in rows if row_kinds(row) & selected_kinds]
    if args.natural_only:
        rows = natural_only_rows(rows)
    if not rows:
        raise RuntimeError("No training rows matched the requested filters")
    dataset_kinds, dataset_prompt_hash = validate_training_rows(rows, allowed_kinds)
    inherited_manifest: dict[str, Any] | None = None
    inherited_kinds: set[str] = set()
    if args.resume_adapter:
        inherited_manifest, inherited_kinds = resume_manifest(
            args.resume_adapter,
            expected_prompt_hash=dataset_prompt_hash,
            expected_base_model=args.base_model,
            expected_base_model_revision=base_model_revision,
            expected_base_model_files_sha256=base_model_provenance["baseModelFilesSha256"],
            expected_base_model_artifact_sha256=base_model_provenance["baseModelArtifactSha256"],
            allow_legacy=args.allow_legacy_resume,
        )
    effective_dataset_kinds = dataset_kinds | inherited_kinds
    # A full stage must contain every operation it is allowed to learn plus
    # explicit abstention rows. Focused `--kinds` runs intentionally omit the
    # negative bucket, but still fail when any requested kind is absent.
    required_stage_kinds = selected_kinds or set(allowed_kinds)
    sampling = sample_rows(
        rows,
        policy=args.sampling_policy,
        seed=args.seed,
        required_kinds=required_stage_kinds,
        require_abstention=not selected_kinds,
        bucket_weights={
            ABSTENTION_BUCKET: args.abstention_weight,
            MULTI_ACTION_BUCKET: args.multi_action_weight,
        },
    )
    rows = list(sampling.rows)
    tokenizer = AutoTokenizer.from_pretrained(
        args.base_model,
        revision=base_model_revision,
        local_files_only=True,
        use_fast=True,
    )
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    dataset = IntentDataset(rows, tokenizer, args.max_length)
    if not dataset:
        raise RuntimeError(
            "The encoded training dataset is empty; "
            f"maxLength={args.max_length}, maxObservedTokens={dataset.max_observed_tokens}, "
            f"skippedTooLong={dataset.skipped_too_long}, skippedNoLabels={dataset.skipped_no_labels}"
        )
    if dataset.skipped_too_long or dataset.skipped_no_labels:
        raise RuntimeError(
            "Training would silently omit rows. Increase --max-length or shorten the prompt; "
            f"maxLength={args.max_length}, maxObservedTokens={dataset.max_observed_tokens}, "
            f"skippedTooLong={dataset.skipped_too_long}, skippedNoLabels={dataset.skipped_no_labels}"
        )

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        revision=base_model_revision,
        local_files_only=True,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model.config.use_cache = False
    if args.gradient_checkpointing:
        model.gradient_checkpointing_enable()
        model.enable_input_require_grads()
    if args.resume_adapter:
        model = PeftModel.from_pretrained(model, args.resume_adapter, is_trainable=True)
    else:
        model = get_peft_model(
            model,
            LoraConfig(
                task_type="CAUSAL_LM",
                r=8,
                lora_alpha=16,
                lora_dropout=0.05,
                bias="none",
                target_modules=["q_proj", "v_proj"],
            ),
        )
    model.print_trainable_parameters()
    model.train()

    loader = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=False,
        collate_fn=functools.partial(collate_intent_batch, pad_token_id=int(tokenizer.pad_token_id)),
    )
    optimizer = torch.optim.AdamW(
        [parameter for parameter in model.parameters() if parameter.requires_grad],
        lr=args.learning_rate,
        weight_decay=0.01,
    )
    optimizer.zero_grad(set_to_none=True)
    started_at = time.time()
    optimizer_step = 0
    micro_step = 0
    rolling_loss = 0.0

    while optimizer_step < args.max_steps:
        for batch in loader:
            outputs = model(**{key: value for key, value in batch.items()})
            loss = outputs.loss / args.gradient_accumulation
            loss.backward()
            rolling_loss += float(loss.detach()) * args.gradient_accumulation
            micro_step += 1
            if micro_step % args.gradient_accumulation != 0:
                continue
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            optimizer_step += 1
            average_loss = rolling_loss / args.gradient_accumulation
            rolling_loss = 0.0
            elapsed = time.time() - started_at
            print(json.dumps({
                "step": optimizer_step,
                "maxSteps": args.max_steps,
                "loss": round(average_loss, 5),
                "elapsedSeconds": round(elapsed, 1),
            }), flush=True)
            if optimizer_step >= args.max_steps:
                break

    model.save_pretrained(args.output, safe_serialization=True)
    tokenizer.save_pretrained(args.output)
    adapter_model_path = args.output / "adapter_model.safetensors"
    adapter_config_path = args.output / "adapter_config.json"
    if not adapter_model_path.is_file() or not adapter_config_path.is_file():
        raise RuntimeError("Adapter save completed without the expected model/config artifacts")
    manifest = {
        "schema": "hatab-erp-intent-lora-v2",
        "baseModel": args.base_model,
        "baseModelRevision": base_model_revision,
        "baseModelFilesSha256": base_model_provenance["baseModelFilesSha256"],
        "baseModelArtifactSha256": base_model_provenance["baseModelArtifactSha256"],
        "adapterPath": str(args.output.resolve()),
        "adapterModelSha256": sha256(adapter_model_path),
        "adapterConfigSha256": sha256(adapter_config_path),
        "datasetPath": str(args.train.resolve()),
        "datasetSha256": sha256(args.train.resolve()),
        "datasetRows": len(dataset),
        "sampling": sampling.metadata,
        "maxObservedTokens": dataset.max_observed_tokens,
        "skippedTooLong": dataset.skipped_too_long,
        "skippedNoLabels": dataset.skipped_no_labels,
        "maxLength": args.max_length,
        "optimizerSteps": optimizer_step,
        "batchSize": args.batch_size,
        "gradientAccumulation": args.gradient_accumulation,
        "learningRate": args.learning_rate,
        "resumedFrom": str(args.resume_adapter.resolve()) if args.resume_adapter else None,
        "selectedKinds": sorted(selected_kinds),
        "currentStageDatasetKinds": sorted(dataset_kinds),
        "datasetKinds": sorted(effective_dataset_kinds),
        "modelEnabledKindsAtTraining": sorted(MODEL_ENABLED_KINDS),
        "allowDisabled": args.allow_disabled,
        "promptSha256": dataset_prompt_hash,
        **contract_metadata(),
        "resumedManifestContractSha256": inherited_manifest.get("contractSha256") if inherited_manifest else None,
        "resumedManifestPromptSha256": inherited_manifest.get("promptSha256") if inherited_manifest else None,
        "allowLegacyResume": args.allow_legacy_resume,
        "resumedManifestBaseModelRevision": inherited_manifest.get("baseModelRevision") if inherited_manifest else None,
        "resumedManifestBaseModelArtifactSha256": inherited_manifest.get("baseModelArtifactSha256") if inherited_manifest else None,
        "naturalOnly": args.natural_only,
        "gradientCheckpointing": args.gradient_checkpointing,
        "seed": args.seed,
        "elapsedSeconds": round(time.time() - started_at, 1),
        "torchVersion": torch.__version__,
        "runtime": {
            "pythonVersion": platform.python_version(),
            "pythonImplementation": platform.python_implementation(),
            "platform": platform.platform(),
            "executable": str(Path(sys.executable).resolve()),
            "torchVersion": torch.__version__,
            "transformersVersion": transformers.__version__,
            "peftVersion": peft.__version__,
            "threads": args.threads,
        },
    }
    (args.output / "hatab-training-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
