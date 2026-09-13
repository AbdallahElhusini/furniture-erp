from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable

from contract import (
    CONTRACT,
    MODEL_ENABLED_KINDS,
    REGISTERED_KINDS,
    contract_metadata,
    normalize_text,
    sha256_file,
    validate_envelope,
)
from prompt import SYSTEM_PROMPT, prompt_sha256


ARABIC_PATTERN = re.compile(r"[\u0600-\u06ff]")
LATIN_PATTERN = re.compile(r"[A-Za-z]")


def language_bucket(text: str) -> str:
    has_arabic = bool(ARABIC_PATTERN.search(text))
    has_latin = bool(LATIN_PATTERN.search(text))
    if has_arabic and has_latin:
        return "mixed"
    if has_arabic:
        return "ar"
    return "en"


def compact_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def parse_jsonl(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    errors: list[str] = []
    if not path.is_file():
        return rows, [f"file.missing:{path}"]
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                errors.append(f"row.invalid_json:{path.name}:{line_number}:{error.msg}")
                continue
            if not isinstance(value, dict):
                errors.append(f"row.invalid_type:{path.name}:{line_number}")
                continue
            rows.append(value)
    return rows, errors


def _extract_row(
    row: dict[str, Any],
    *,
    split_name: str,
    index: int,
    allowed_kinds: Iterable[str],
    strict_prompt: bool,
) -> tuple[str | None, set[str], str | None, list[str]]:
    row_path = f"{split_name}[{index}]"
    errors: list[str] = []
    prompt = row.get("prompt")
    completion = row.get("completion")
    if not isinstance(prompt, list) or len(prompt) < 2:
        return None, set(), None, [f"row.invalid_prompt:{row_path}"]
    if not isinstance(completion, list) or len(completion) != 1:
        return None, set(), None, [f"row.invalid_completion:{row_path}"]
    system_message = prompt[0] if isinstance(prompt[0], dict) else {}
    user_message = prompt[-1] if isinstance(prompt[-1], dict) else {}
    assistant_message = completion[0] if isinstance(completion[0], dict) else {}
    system_content = system_message.get("content")
    user_content = user_message.get("content")
    completion_content = assistant_message.get("content")
    if system_message.get("role") != "system" or not isinstance(system_content, str):
        errors.append(f"row.invalid_system_message:{row_path}")
    elif strict_prompt and system_content != SYSTEM_PROMPT:
        errors.append(f"row.system_prompt_drift:{row_path}")
    if user_message.get("role") != "user" or not isinstance(user_content, str) or not user_content.strip():
        errors.append(f"row.invalid_user_message:{row_path}")
        user_content = None
    if assistant_message.get("role") != "assistant" or not isinstance(completion_content, str):
        errors.append(f"row.invalid_assistant_message:{row_path}")
        return user_content, set(), system_content if isinstance(system_content, str) else None, errors
    try:
        expected = json.loads(completion_content)
    except json.JSONDecodeError as error:
        errors.append(f"row.invalid_completion_json:{row_path}:{error.msg}")
        return user_content, set(), system_content if isinstance(system_content, str) else None, errors
    contract_errors = validate_envelope(
        expected,
        allowed_kinds=allowed_kinds,
        source=user_content,
        require_nonempty=True,
    )
    errors.extend(f"row.contract:{row_path}:{error}" for error in contract_errors)
    kinds = {
        action["kind"]
        for action in expected.get("actions", [])
        if isinstance(action, dict) and isinstance(action.get("kind"), str)
    } if isinstance(expected, dict) else set()
    return user_content, kinds, system_content if isinstance(system_content, str) else None, errors


def _read_manifest(path: Path | None) -> tuple[dict[str, Any] | None, list[str]]:
    if path is None:
        return None, []
    if not path.is_file():
        return None, [f"manifest.missing:{path}"]
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return None, [f"manifest.invalid_json:{error.msg}"]
    if not isinstance(value, dict):
        return None, ["manifest.invalid_type"]
    return value, []


def _template_family(row: dict[str, Any]) -> str | None:
    metadata = row.get("metadata")
    family = metadata.get("templateFamily") if isinstance(metadata, dict) else None
    return family.strip() if isinstance(family, str) and family.strip() else None


def _action_count(row: dict[str, Any]) -> int:
    try:
        value = json.loads(row["completion"][0]["content"])
        actions = value.get("actions", [])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return 0
    return len(actions) if isinstance(actions, list) else 0


def _manifest_drift(
    manifest: dict[str, Any] | None,
    *,
    train_path: Path,
    eval_path: Path,
    train_rows: int,
    eval_rows: int,
) -> tuple[list[str], list[str]]:
    if manifest is None:
        return [], ["manifest.not_checked"]
    errors: list[str] = []
    warnings: list[str] = []
    expected = {
        "trainRows": train_rows,
        "evalRows": eval_rows,
        "trainSha256": sha256_file(train_path),
        "evalSha256": sha256_file(eval_path),
    }
    for key, actual in expected.items():
        if manifest.get(key) != actual:
            errors.append(f"manifest.mismatch:{key}")
    metadata = contract_metadata()
    for key in ("schemaVersion", "contractVersion", "contractSha256"):
        if key not in manifest:
            warnings.append(f"manifest.legacy_missing:{key}")
        elif manifest[key] != metadata[key]:
            errors.append(f"manifest.contract_drift:{key}")
    current_prompt_hash = prompt_sha256()
    if "promptSha256" not in manifest:
        warnings.append("manifest.legacy_missing:promptSha256")
    elif manifest["promptSha256"] != current_prompt_hash:
        errors.append("manifest.prompt_drift:promptSha256")
    return errors, warnings


def validate_dataset(
    train_path: Path,
    eval_path: Path,
    *,
    manifest_path: Path | None = None,
    allowed_kinds: Iterable[str] = MODEL_ENABLED_KINDS,
    required_coverage: Iterable[str] = MODEL_ENABLED_KINDS,
    strict_prompt: bool = True,
) -> dict[str, Any]:
    train_path, eval_path = train_path.resolve(), eval_path.resolve()
    allowed = frozenset(allowed_kinds)
    required = frozenset(required_coverage)
    configuration_errors: list[str] = []
    if not allowed.issubset(REGISTERED_KINDS):
        configuration_errors.append(
            "configuration.unregistered_allowed_kinds:" + ",".join(sorted(allowed - REGISTERED_KINDS))
        )
    if not required.issubset(allowed):
        configuration_errors.append(
            "configuration.required_not_allowed:" + ",".join(sorted(required - allowed))
        )

    split_rows: dict[str, list[dict[str, Any]]] = {}
    errors: list[str] = list(configuration_errors)
    warnings: list[str] = []
    for name, path in (("train", train_path), ("eval", eval_path)):
        rows, read_errors = parse_jsonl(path)
        split_rows[name] = rows
        errors.extend(read_errors)

    manifest, manifest_errors = _read_manifest(manifest_path.resolve() if manifest_path else None)
    errors.extend(manifest_errors)
    required_action_counts: tuple[int, ...] = ()
    if manifest is not None and "requiredActionCounts" in manifest:
        raw_required_counts = manifest.get("requiredActionCounts")
        contract_max_actions = CONTRACT.value["envelope"]["maxActions"]
        if (
            not isinstance(raw_required_counts, list)
            or not raw_required_counts
            or any(
                not isinstance(value, int)
                or isinstance(value, bool)
                or value < 1
                or value > contract_max_actions
                for value in raw_required_counts
            )
            or len(set(raw_required_counts)) != len(raw_required_counts)
        ):
            errors.append("manifest.required_action_counts_invalid")
        else:
            required_action_counts = tuple(raw_required_counts)
    family_split_required = bool(
        manifest and manifest.get("splitPolicy") == "template-family-disjoint-stratified-seeded"
    )
    if train_path.is_file() and eval_path.is_file():
        drift_errors, drift_warnings = _manifest_drift(
            manifest,
            train_path=train_path,
            eval_path=eval_path,
            train_rows=len(split_rows["train"]),
            eval_rows=len(split_rows["eval"]),
        )
        errors.extend(drift_errors)
        warnings.extend(drift_warnings)

    split_reports: dict[str, Any] = {}
    split_observed_kinds: dict[str, set[str]] = {}
    observed_kinds: collections.Counter[str] = collections.Counter()
    messages_by_split: dict[str, list[str]] = {}
    families_by_split: dict[str, set[str]] = {}
    prompt_hashes: collections.Counter[str] = collections.Counter()
    for split_name, rows in split_rows.items():
        kinds: collections.Counter[str] = collections.Counter()
        languages: collections.Counter[str] = collections.Counter()
        messages: list[str] = []
        families: set[str] = set()
        multi_action_rows = 0
        action_counts: collections.Counter[int] = collections.Counter()
        for index, row in enumerate(rows, 1):
            message, row_kinds, row_prompt, row_errors = _extract_row(
                row,
                split_name=split_name,
                index=index,
                allowed_kinds=allowed,
                strict_prompt=strict_prompt,
            )
            errors.extend(row_errors)
            if message is not None:
                messages.append(message.strip())
                languages[language_bucket(message)] += 1
            if row_prompt is not None:
                prompt_hashes[hashlib.sha256(row_prompt.encode("utf-8")).hexdigest()] += 1
            kinds.update(row_kinds)
            observed_kinds.update(row_kinds)
            family = _template_family(row)
            if family is not None:
                families.add(family)
            elif family_split_required:
                errors.append(f"row.missing_template_family:{split_name}[{index}]")
            action_count = _action_count(row)
            action_counts[action_count] += 1
            if action_count >= 2:
                multi_action_rows += 1
        messages_by_split[split_name] = messages
        families_by_split[split_name] = families
        split_observed_kinds[split_name] = set(kinds)
        duplicate_messages = sum(count - 1 for count in collections.Counter(messages).values() if count > 1)
        split_reports[split_name] = {
            "path": str((train_path if split_name == "train" else eval_path)),
            "rows": len(rows),
            "sha256": sha256_file(train_path if split_name == "train" else eval_path)
            if (train_path if split_name == "train" else eval_path).is_file() else None,
            "actionDistribution": dict(sorted(kinds.items())),
            "languageDistribution": dict(sorted(languages.items())),
            "duplicateMessageRows": duplicate_messages,
            "templateFamilyCount": len(families),
            "multiActionRows": multi_action_rows,
            "actionCountDistribution": {
                str(count): rows for count, rows in sorted(action_counts.items())
            },
        }
        if duplicate_messages:
            warnings.append(f"dataset.duplicate_messages:{split_name}:{duplicate_messages}")

    normalized_train = {normalize_text(message) for message in messages_by_split.get("train", [])}
    normalized_eval = {normalize_text(message) for message in messages_by_split.get("eval", [])}
    leaked_messages = sorted(normalized_train & normalized_eval)
    if leaked_messages:
        errors.append(f"dataset.cross_split_message_leakage:{len(leaked_messages)}")
    leaked_families = sorted(
        families_by_split.get("train", set()) & families_by_split.get("eval", set())
    )
    if family_split_required:
        if leaked_families:
            errors.append(f"dataset.cross_split_template_family_leakage:{len(leaked_families)}")
        for split_name in ("train", "eval"):
            if split_reports.get(split_name, {}).get("multiActionRows", 0) < 1:
                errors.append(f"dataset.missing_multi_action_rows:{split_name}")
        split_metadata = manifest.get("splitMetadata") if manifest else None
        if not isinstance(split_metadata, dict):
            errors.append("manifest.split_metadata_missing_or_invalid")
        else:
            expected_split_metadata = {
                "policy": "template-family-disjoint-stratified-seeded",
                "evalActualRows": len(split_rows["eval"]),
                "trainFamilyCount": len(families_by_split.get("train", set())),
                "evalFamilyCount": len(families_by_split.get("eval", set())),
                "overlapCount": len(leaked_families),
                "trainFamilies": sorted(families_by_split.get("train", set())),
                "evalFamilies": sorted(families_by_split.get("eval", set())),
            }
            for key, expected in expected_split_metadata.items():
                if split_metadata.get(key) != expected:
                    errors.append(f"manifest.split_metadata_mismatch:{key}")
    missing_coverage = sorted(required - set(observed_kinds))
    if missing_coverage:
        errors.append("dataset.missing_required_coverage:" + ",".join(missing_coverage))
    missing_coverage_by_split = {
        split: sorted(required - kinds) for split, kinds in split_observed_kinds.items()
    }
    for split, missing in missing_coverage_by_split.items():
        if missing:
            errors.append(f"dataset.missing_split_coverage:{split}:" + ",".join(missing))
    disabled_observed = sorted(set(observed_kinds) - MODEL_ENABLED_KINDS)

    for split_name in ("train", "eval"):
        distribution = split_reports.get(split_name, {}).get("actionCountDistribution", {})
        for required_count in required_action_counts:
            if distribution.get(str(required_count), 0) < 1:
                errors.append(
                    f"dataset.missing_required_action_count:{split_name}:{required_count}"
                )
    if manifest is not None and required_action_counts:
        expected_distributions = {
            split: split_reports.get(split, {}).get("actionCountDistribution", {})
            for split in ("train", "eval")
        }
        if manifest.get("actionCountDistribution") != expected_distributions:
            errors.append("manifest.mismatch:actionCountDistribution")

    error_counts = collections.Counter(error.split(":", 1)[0] for error in errors)
    report = {
        "schema": "hatab-local-ai-dataset-validation-v2",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "valid": not errors,
        **contract_metadata(),
        "promptSha256": prompt_sha256(),
        "allowedKinds": sorted(allowed),
        "requiredCoverage": sorted(required),
        "requiredActionCounts": list(required_action_counts),
        "observedKinds": sorted(observed_kinds),
        "missingCoverage": missing_coverage,
        "missingCoverageBySplit": missing_coverage_by_split,
        "disabledKindsObserved": disabled_observed,
        "promptHashes": dict(sorted(prompt_hashes.items())),
        "splits": split_reports,
        "leakage": {
            "crossSplitMessageCount": len(leaked_messages),
            "sampleSha256": [hashlib.sha256(value.encode("utf-8")).hexdigest() for value in leaked_messages[:20]],
            "crossSplitTemplateFamilyCount": len(leaked_families),
            "templateFamilySample": leaked_families[:20],
        },
        "errorCount": len(errors),
        "errorCounts": dict(sorted(error_counts.items())),
        "errors": errors[:250],
        "errorsTruncated": max(0, len(errors) - 250),
        "warnings": warnings,
        "manifest": manifest,
    }
    report["validationSha256"] = compact_sha256({key: value for key, value in report.items() if key != "generatedAt"})
    return report


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Validate HATAB local-AI datasets against the canonical contract")
    parser.add_argument("--train", type=Path, default=base / "data" / "train.jsonl")
    parser.add_argument("--eval", type=Path, default=base / "data" / "eval.jsonl")
    parser.add_argument("--manifest", type=Path, default=base / "data" / "manifest.json")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--allow-disabled", action="store_true")
    parser.add_argument("--required-kinds", default="")
    parser.add_argument("--no-strict-prompt", action="store_true")
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    allowed = REGISTERED_KINDS if args.allow_disabled else MODEL_ENABLED_KINDS
    required = {
        value.strip() for value in args.required_kinds.split(",") if value.strip()
    } or MODEL_ENABLED_KINDS
    report = validate_dataset(
        args.train,
        args.eval,
        manifest_path=args.manifest,
        allowed_kinds=allowed,
        required_coverage=required,
        strict_prompt=not args.no_strict_prompt,
    )
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    if not report["valid"] and not args.report_only:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
