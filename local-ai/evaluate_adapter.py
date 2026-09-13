from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from base_model_provenance import (
    PINNED_BASE_MODEL,
    download_base_model_provenance,
    require_pinned_base_model,
)
from contract import MODEL_ENABLED_KINDS, REGISTERED_KINDS, contract_metadata, sha256_file, validate_envelope
from dataset_validation import language_bucket
from evaluation_core import (
    PROMOTION_MINIMUM_ABSTENTION_RATE,
    PROMOTION_MINIMUM_EXACT_RATE,
    PROMOTION_MINIMUM_KIND_RATE,
    action_kinds,
    evaluation_report,
    golden_fixture_identity,
    model_eligible,
    promotion_gate_thresholds,
    promotion_gates,
    read_jsonl as read_golden_jsonl,
    validate_golden_cases,
)
from generation import generate_json_completion, generation_policy_metadata
from prompt import build_base_system_prompt, prompt_sha256


def read_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}: {error.msg}") from error
            if not isinstance(value, dict):
                raise ValueError(f"Expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def expected_value(row: dict[str, Any]) -> dict[str, Any]:
    try:
        value = json.loads(row["completion"][0]["content"])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("Invalid dataset completion") from error
    if not isinstance(value, dict):
        raise ValueError("Dataset completion must contain a JSON object")
    return value


def user_message(row: dict[str, Any]) -> str:
    try:
        value = row["prompt"][-1]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise ValueError("Invalid dataset prompt") from error
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Dataset user message must be non-empty")
    return value


def adapter_manifest(path: Path) -> dict[str, Any] | None:
    manifest_path = path / "hatab-training-manifest.json"
    if not manifest_path.is_file():
        return None
    value = json.loads(manifest_path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else None


def require_safe_promotion_evaluation(
    *,
    golden: Path | None,
    limit: int,
    selected_kinds: set[str],
    natural_only: bool,
    allow_disabled: bool,
    minimum_kind_rate: float,
    minimum_exact_rate: float,
    minimum_abstention_rate: float,
) -> None:
    errors: list[str] = []
    if golden is None:
        errors.append("the canonical golden fixture is required")
    if limit > 0:
        errors.append("--limit is diagnostics-only")
    if selected_kinds:
        errors.append("--kinds is diagnostics-only")
    if natural_only:
        errors.append("--natural-only is diagnostics-only")
    if allow_disabled:
        errors.append("--allow-disabled is diagnostics-only")
    if minimum_kind_rate != PROMOTION_MINIMUM_KIND_RATE:
        errors.append("--minimum-kind-rate must use the code-pinned promotion threshold")
    if minimum_exact_rate != PROMOTION_MINIMUM_EXACT_RATE:
        errors.append("--minimum-exact-rate must use the code-pinned promotion threshold")
    if minimum_abstention_rate != PROMOTION_MINIMUM_ABSTENTION_RATE:
        errors.append("--minimum-abstention-rate must use the code-pinned promotion threshold")
    if errors:
        raise ValueError("Unsafe promotion evaluation configuration: " + "; ".join(errors))


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Evaluate a HATAB adapter against a contract-checked dataset")
    parser.add_argument("--base-model", default=PINNED_BASE_MODEL)
    parser.add_argument("--adapter", type=Path, default=Path(r"D:\hatab-local-ai\artifacts\qwen3-0.6b-hatab-lora-candidate-v3-pinned-c1899de2"))
    parser.add_argument("--eval", type=Path, default=base / "data" / "eval.jsonl")
    parser.add_argument("--golden", type=Path)
    parser.add_argument("--output", type=Path, default=base / "reports" / "adapter-evaluation.json")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 4) - 1))
    parser.add_argument("--kinds", default="")
    parser.add_argument("--natural-only", action="store_true")
    parser.add_argument("--allow-disabled", action="store_true")
    parser.add_argument("--require-gates", action="store_true")
    parser.add_argument("--minimum-kind-rate", type=float, default=PROMOTION_MINIMUM_KIND_RATE)
    parser.add_argument("--minimum-exact-rate", type=float, default=PROMOTION_MINIMUM_EXACT_RATE)
    parser.add_argument("--minimum-abstention-rate", type=float, default=PROMOTION_MINIMUM_ABSTENTION_RATE)
    args = parser.parse_args()
    training_manifest = adapter_manifest(args.adapter)
    if training_manifest is None:
        raise ValueError("Adapter is missing hatab-training-manifest.json")
    base_model_revision = training_manifest.get("baseModelRevision")
    if not isinstance(base_model_revision, str):
        raise ValueError("Adapter manifest is missing baseModelRevision")
    require_pinned_base_model(args.base_model, base_model_revision)
    if training_manifest.get("baseModel") != args.base_model:
        raise ValueError(
            "Adapter manifest base model/revision does not match the pinned evaluation base snapshot"
        )

    allowed_kinds = REGISTERED_KINDS if args.allow_disabled else MODEL_ENABLED_KINDS
    selected_kinds = {value.strip() for value in args.kinds.split(",") if value.strip()}
    if args.require_gates:
        require_safe_promotion_evaluation(
            golden=args.golden,
            limit=args.limit,
            selected_kinds=selected_kinds,
            natural_only=args.natural_only,
            allow_disabled=args.allow_disabled,
            minimum_kind_rate=args.minimum_kind_rate,
            minimum_exact_rate=args.minimum_exact_rate,
            minimum_abstention_rate=args.minimum_abstention_rate,
        )
    unknown = selected_kinds - REGISTERED_KINDS
    disabled = selected_kinds - allowed_kinds
    if unknown:
        raise ValueError(f"Requested unregistered kinds: {sorted(unknown)}")
    if disabled:
        raise ValueError(f"Requested model-disabled kinds without --allow-disabled: {sorted(disabled)}")
    runtime_prompt = build_base_system_prompt(allowed_kinds)

    cases: list[dict[str, Any]] = []
    golden_identity: dict[str, Any] | None = None
    evaluation_path = (args.golden or args.eval).resolve()
    if args.golden:
        all_golden = read_golden_jsonl(evaluation_path)
        fixture_validation = validate_golden_cases(all_golden)
        if not fixture_validation["valid"]:
            raise ValueError("Golden fixture is invalid: " + "; ".join(fixture_validation["errors"]))
        golden_identity = golden_fixture_identity(evaluation_path, all_golden)
        cases = [case for case in all_golden if args.allow_disabled or model_eligible(case)]
        if selected_kinds:
            cases = [case for case in cases if set(action_kinds(case["expected"])) & selected_kinds]
    else:
        rows = read_rows(evaluation_path)
        if selected_kinds:
            rows = [row for row in rows if set(action_kinds(expected_value(row))) & selected_kinds]
        if args.natural_only:
            rows = [row for row in rows if "|" not in user_message(row)]
        for index, row in enumerate(rows, 1):
            message, expected = user_message(row), expected_value(row)
            try:
                row_system_prompt = row["prompt"][0]["content"]
            except (KeyError, IndexError, TypeError) as error:
                raise ValueError(f"Evaluation row {index} has an invalid system prompt") from error
            if row_system_prompt != runtime_prompt:
                raise ValueError(f"Evaluation row {index} contains system-prompt drift")
            errors = validate_envelope(expected, allowed_kinds=allowed_kinds, source=message, require_nonempty=True)
            if errors:
                raise ValueError(f"Evaluation row {index} violates the active contract: {'; '.join(errors)}")
            cases.append({
                "id": f"dataset-{index:05d}",
                "language": language_bucket(message),
                "category": "supported" if expected.get("actions") else "ambiguity",
                "message": message,
                "expected": expected,
            })
    if args.limit > 0:
        cases = cases[: args.limit]
    if not cases:
        raise RuntimeError("No evaluation cases matched the requested filters")

    base_model_provenance = download_base_model_provenance(args.base_model)
    expected_provenance = {
        "baseModel": args.base_model,
        "baseModelRevision": base_model_revision,
        "baseModelFilesSha256": base_model_provenance["baseModelFilesSha256"],
        "baseModelArtifactSha256": base_model_provenance["baseModelArtifactSha256"],
    }
    mismatched_provenance = [
        field for field, expected in expected_provenance.items()
        if training_manifest.get(field) != expected
    ]
    if mismatched_provenance:
        raise ValueError(
            "Adapter manifest is not bound to the pinned evaluation base snapshot: "
            + ", ".join(mismatched_provenance)
        )

    # Heavy model dependencies are intentionally loaded only after the dataset and contract preflight succeeds.
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    torch.set_num_threads(args.threads)
    tokenizer = AutoTokenizer.from_pretrained(
        args.base_model,
        revision=base_model_revision,
        local_files_only=True,
        use_fast=True,
    )
    base_model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        revision=base_model_revision,
        local_files_only=True,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model = PeftModel.from_pretrained(base_model, args.adapter)
    model.eval()
    predictions: dict[str, Any] = {}
    latencies: dict[str, int] = {}
    completions: dict[str, str] = {}
    generation_metadata: dict[str, dict[str, Any]] = {}

    for index, case in enumerate(cases, 1):
        messages = [
            {"role": "system", "content": runtime_prompt},
            {"role": "user", "content": case["message"]},
        ]
        rendered = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
        )
        encoded = tokenizer(rendered, return_tensors="pt")
        generated = generate_json_completion(model, tokenizer, encoded)
        latency_ms = generated.elapsed_ms
        completion = generated.text
        predictions[case["id"]] = completion
        latencies[case["id"]] = latency_ms
        completions[case["id"]] = completion[:4000]
        generation_metadata[case["id"]] = generated.metadata()
        print(json.dumps({
            "index": index,
            "id": case["id"],
            "latencyMs": latency_ms,
            "stopReason": generated.stop_reason,
            "generatedTokens": generated.generated_tokens,
        }, ensure_ascii=False), flush=True)

    report = evaluation_report(
        cases,
        predictions,
        allowed_kinds=allowed_kinds,
        evaluation_scope="candidate" if args.allow_disabled else "model-enabled",
    )
    report.update({
        "baseModel": args.base_model,
        "baseModelRevision": base_model_revision,
        "baseModelFilesSha256": base_model_provenance["baseModelFilesSha256"],
        "baseModelArtifactSha256": base_model_provenance["baseModelArtifactSha256"],
        "adapterPath": str(args.adapter.resolve()),
        "adapterManifest": training_manifest,
        "adapterManifestSha256": sha256_file(args.adapter / "hatab-training-manifest.json")
        if (args.adapter / "hatab-training-manifest.json").is_file() else None,
        "datasetPath": str(evaluation_path),
        "datasetSha256": sha256_file(evaluation_path),
        "goldenFixture": args.golden is not None,
        **(golden_identity or {}),
        "evaluatedCaseCount": len(cases),
        "evaluatedCaseIds": [case["id"] for case in cases],
        "runtimePromptSha256": prompt_sha256(runtime_prompt),
        "selectedKinds": sorted(selected_kinds),
        "naturalOnly": args.natural_only,
        "threads": args.threads,
        "generationPolicy": generation_policy_metadata(),
        **contract_metadata(),
    })
    for result in report["results"]:
        result["latencyMs"] = latencies[result["id"]]
        result["completion"] = completions[result["id"]]
        result["generation"] = generation_metadata[result["id"]]
        result.pop("prediction", None)
    latency_values = sorted(latencies.values())
    report["latencyMs"] = {
        "mean": sum(latency_values) / len(latency_values),
        "p50": latency_values[(len(latency_values) - 1) // 2],
        "p95": latency_values[max(0, int(len(latency_values) * 0.95) - 1)],
        "max": max(latency_values),
    }
    metrics = report["metrics"]
    report["gateThresholds"] = promotion_gate_thresholds()
    report["gates"] = promotion_gates(metrics)
    report["passed"] = all(report["gates"].values())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    if args.require_gates and not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
