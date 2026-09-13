from __future__ import annotations

import collections
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from contract import MODEL_ENABLED_KINDS, REGISTERED_KINDS, contract_metadata, validate_envelope
from prompt import prompt_sha256


PROMOTION_MINIMUM_KIND_RATE = 0.95
PROMOTION_MINIMUM_EXACT_RATE = 0.90
PROMOTION_MINIMUM_ABSTENTION_RATE = 1.0


def promotion_gate_thresholds() -> dict[str, float]:
    return {
        "contractValidRate": 1.0,
        "actionKindExactRate": PROMOTION_MINIMUM_KIND_RATE,
        "exactMatchRate": PROMOTION_MINIMUM_EXACT_RATE,
        "abstentionCorrectRate": PROMOTION_MINIMUM_ABSTENTION_RATE,
        "multiActionExactRate": 1.0,
    }


def promotion_gates(metrics: dict[str, Any]) -> dict[str, bool]:
    return {
        "contractValidRate": metrics.get("contractValidRate", 0.0) == 1.0,
        "actionKindExactRate": metrics.get("actionKindsExactRate", 0.0) >= PROMOTION_MINIMUM_KIND_RATE,
        "exactMatchRate": metrics.get("exactMatchRate", 0.0) >= PROMOTION_MINIMUM_EXACT_RATE,
        "abstentionCorrectRate": (
            metrics.get("abstentionCorrectRate", 0.0) >= PROMOTION_MINIMUM_ABSTENTION_RATE
        ),
        "multiActionExactRate": (
            metrics.get("multiActionSamples", 0) > 0
            and metrics.get("multiActionExactRate", 0.0) == 1.0
        ),
    }


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}: {error.msg}") from error
            if not isinstance(row, dict):
                raise ValueError(f"Expected object at {path}:{line_number}")
            case_id = row.get("id")
            if not isinstance(case_id, str) or not case_id.strip():
                raise ValueError(f"Missing case id at {path}:{line_number}")
            if case_id in seen_ids:
                raise ValueError(f"Duplicate case id at {path}:{line_number}: {case_id}")
            seen_ids.add(case_id)
            rows.append(row)
    return rows


def parse_json_object(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    try:
        # Match the production boundary in serve.strict_result: a model
        # completion must be exactly one JSON object.  Do not award a valid
        # prediction to prose, Markdown fences, or any trailing payload.
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def normalized(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return [normalized(item) for item in value]
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in sorted(value.items())}
    return value


def action_kinds(value: dict[str, Any] | None) -> list[str]:
    if not value or not isinstance(value.get("actions"), list):
        return []
    return [
        action.get("kind")
        for action in value["actions"]
        if isinstance(action, dict) and isinstance(action.get("kind"), str)
    ]


def _field_facts(value: dict[str, Any] | None) -> set[tuple[int, str, str, str]]:
    if not value or not isinstance(value.get("actions"), list):
        return set()
    result: set[tuple[int, str, str, str]] = set()
    for index, action in enumerate(value["actions"]):
        if not isinstance(action, dict):
            continue
        kind = str(action.get("kind", ""))
        for field, field_value in action.items():
            if field == "kind":
                continue
            result.add((index, kind, field, json.dumps(normalized(field_value), ensure_ascii=False, sort_keys=True)))
    return result


def validate_golden_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    errors: list[str] = []
    kind_counts: collections.Counter[str] = collections.Counter()
    language_counts: collections.Counter[str] = collections.Counter()
    category_counts: collections.Counter[str] = collections.Counter()
    for index, case in enumerate(cases, 1):
        case_id = case.get("id", f"row-{index}")
        language, category = case.get("language"), case.get("category")
        message, expected = case.get("message"), case.get("expected")
        if language not in {"ar", "en", "mixed"}:
            errors.append(f"golden.invalid_language:{case_id}:{language}")
        else:
            language_counts[language] += 1
        if category not in {"supported", "ambiguity", "unsupported", "safety"}:
            errors.append(f"golden.invalid_category:{case_id}:{category}")
        else:
            category_counts[category] += 1
        if not isinstance(message, str) or not message.strip():
            errors.append(f"golden.invalid_message:{case_id}")
            continue
        contract_errors = validate_envelope(
            expected,
            allowed_kinds=REGISTERED_KINDS,
            source=message,
            require_nonempty=True,
        )
        errors.extend(f"golden.contract:{case_id}:{error}" for error in contract_errors)
        expected_kinds = action_kinds(expected if isinstance(expected, dict) else None)
        kind_counts.update(expected_kinds)
        if category == "supported" and not expected_kinds:
            errors.append(f"golden.supported_without_action:{case_id}")
        if category != "supported" and expected_kinds:
            errors.append(f"golden.non_supported_with_action:{case_id}")
    missing_registered = sorted(REGISTERED_KINDS - set(kind_counts))
    missing_model_enabled = sorted(MODEL_ENABLED_KINDS - set(kind_counts))
    if missing_registered:
        errors.append("golden.missing_registered_coverage:" + ",".join(missing_registered))
    if missing_model_enabled:
        errors.append("golden.missing_model_coverage:" + ",".join(missing_model_enabled))
    return {
        "valid": not errors,
        "errors": errors,
        "cases": len(cases),
        "kindDistribution": dict(sorted(kind_counts.items())),
        "languageDistribution": dict(sorted(language_counts.items())),
        "categoryDistribution": dict(sorted(category_counts.items())),
        "missingRegisteredCoverage": missing_registered,
        "missingModelCoverage": missing_model_enabled,
    }


def validate_contract_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    failures: list[dict[str, Any]] = []
    for case in cases:
        expected_valid = case.get("expectedValid")
        if not isinstance(expected_valid, bool):
            failures.append({"id": case["id"], "reason": "expectedValid must be boolean"})
            continue
        errors = validate_envelope(
            case.get("value"),
            allowed_kinds=REGISTERED_KINDS,
            source=case.get("source") if isinstance(case.get("source"), str) else None,
            require_nonempty=True,
        )
        actual_valid = not errors
        expected_error = case.get("expectedError")
        error_matches = expected_error is None or any(error.startswith(str(expected_error)) for error in errors)
        if actual_valid != expected_valid or not error_matches:
            failures.append({
                "id": case["id"],
                "expectedValid": expected_valid,
                "actualValid": actual_valid,
                "expectedError": expected_error,
                "errors": errors,
            })
    return {"valid": not failures, "cases": len(cases), "failures": failures}


def model_eligible(case: dict[str, Any]) -> bool:
    expected = case.get("expected")
    kinds = set(action_kinds(expected if isinstance(expected, dict) else None))
    return not kinds or kinds.issubset(MODEL_ENABLED_KINDS)


def score_case(
    case: dict[str, Any],
    raw_prediction: Any,
    *,
    allowed_kinds: Iterable[str] = REGISTERED_KINDS,
) -> dict[str, Any]:
    expected = case["expected"]
    predicted = parse_json_object(raw_prediction)
    contract_errors = ["prediction.invalid_json"] if predicted is None else validate_envelope(
        predicted,
        allowed_kinds=allowed_kinds,
        source=case["message"],
        require_nonempty=True,
    )
    expected_facts, predicted_facts = _field_facts(expected), _field_facts(predicted)
    true_positive = len(expected_facts & predicted_facts)
    precision = true_positive / max(1, len(predicted_facts))
    recall = true_positive / max(1, len(expected_facts))
    f1 = 2 * precision * recall / max(1e-12, precision + recall) if expected_facts or predicted_facts else 1.0
    expected_abstention = not expected.get("actions")
    predicted_abstention = bool(predicted is not None and not predicted.get("actions"))
    return {
        "id": case["id"],
        "language": case["language"],
        "category": case["category"],
        "modelEligible": model_eligible(case),
        "validJson": predicted is not None,
        "contractValid": not contract_errors,
        "contractErrors": contract_errors,
        "actionKindsExact": action_kinds(predicted) == action_kinds(expected),
        "exactMatch": normalized(predicted) == normalized(expected),
        "abstentionCorrect": expected_abstention == predicted_abstention,
        "expectedAbstention": expected_abstention,
        "fieldPrecision": precision,
        "fieldRecall": recall,
        "fieldF1": f1,
        "expectedKinds": action_kinds(expected),
        "predictedKinds": action_kinds(predicted),
        "expectedActionCount": len(expected.get("actions", [])),
        "prediction": predicted,
    }


def _rates(results: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(results)
    if not count:
        return {"samples": 0}
    keys = ("validJson", "contractValid", "actionKindsExact", "exactMatch", "abstentionCorrect")
    result: dict[str, Any] = {"samples": count}
    for key in keys:
        result[key + "Rate"] = sum(bool(row[key]) for row in results) / count
    for key in ("fieldPrecision", "fieldRecall", "fieldF1"):
        result["mean" + key[0].upper() + key[1:]] = sum(float(row[key]) for row in results) / count
    return result


def evaluation_report(
    cases: list[dict[str, Any]],
    predictions: dict[str, Any],
    *,
    allowed_kinds: Iterable[str] = REGISTERED_KINDS,
    evaluation_scope: str = "pipeline",
) -> dict[str, Any]:
    missing = [case["id"] for case in cases if case["id"] not in predictions]
    selected = [case for case in cases if case["id"] in predictions]
    results = [score_case(case, predictions[case["id"]], allowed_kinds=allowed_kinds) for case in selected]
    by_language = {
        value: _rates([result for result in results if result["language"] == value])
        for value in sorted({result["language"] for result in results})
    }
    by_category = {
        value: _rates([result for result in results if result["category"] == value])
        for value in sorted({result["category"] for result in results})
    }
    by_kind: dict[str, Any] = {}
    for kind in sorted(REGISTERED_KINDS):
        matching = [result for result in results if kind in result["expectedKinds"]]
        if matching:
            by_kind[kind] = _rates(matching)
    metrics = _rates(results)
    multi_action_results = [result for result in results if result["expectedActionCount"] >= 2]
    metrics["multiActionSamples"] = len(multi_action_results)
    metrics["multiActionExactRate"] = (
        sum(bool(result["exactMatch"]) for result in multi_action_results) / len(multi_action_results)
        if multi_action_results else 0.0
    )
    return {
        "schema": "hatab-local-ai-golden-evaluation-v2",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "evaluationScope": evaluation_scope,
        **contract_metadata(),
        "promptSha256": prompt_sha256(),
        "metrics": metrics,
        "byLanguage": by_language,
        "byCategory": by_category,
        "byKind": by_kind,
        "missingPredictionIds": missing,
        "unexpectedPredictionIds": sorted(set(predictions) - {case["id"] for case in cases}),
        "results": results,
    }


def fixture_metadata(path: Path, cases: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "path": str(path.resolve()),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "semanticSha256": hashlib.sha256(
            json.dumps(cases, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "rows": len(cases),
    }


def golden_fixture_identity(path: Path, cases: list[dict[str, Any]]) -> dict[str, Any]:
    metadata = fixture_metadata(path, cases)
    eligible_ids = sorted(case["id"] for case in cases if model_eligible(case))
    return {
        "goldenFixtureSha256": metadata["sha256"],
        "goldenSemanticSha256": metadata["semanticSha256"],
        "goldenTotalCaseCount": metadata["rows"],
        "goldenEligibleCaseCount": len(eligible_ids),
        "goldenEligibleCaseIds": eligible_ids,
    }
