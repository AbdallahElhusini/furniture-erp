from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from contract import CONTRACT, MODEL_ENABLED_KINDS, REGISTERED_KINDS, contract_metadata
from evaluation_core import (
    PROMOTION_MINIMUM_ABSTENTION_RATE,
    PROMOTION_MINIMUM_EXACT_RATE,
    PROMOTION_MINIMUM_KIND_RATE,
    evaluation_report,
    fixture_metadata,
    model_eligible,
    read_jsonl,
    validate_contract_cases,
    validate_golden_cases,
)
from prompt import prompt_sha256


def read_predictions(path: Path) -> dict[str, Any]:
    if path.suffix.lower() == ".jsonl":
        rows = read_jsonl(path)
        predictions: dict[str, Any] = {}
        for row in rows:
            value = row.get("output", row.get("prediction", row.get("completion")))
            if value is None and "actions" in row and "unparsed" in row:
                value = {"actions": row["actions"], "unparsed": row["unparsed"]}
            predictions[row["id"]] = value
        return predictions
    value = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(value, dict) and isinstance(value.get("predictions"), dict):
        return value["predictions"]
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        return {
            row["id"]: row.get("output", row.get("prediction", row.get("completion")))
            for row in value if isinstance(row, dict) and isinstance(row.get("id"), str)
        }
    raise ValueError(f"Unsupported predictions format: {path}")


def _request_json(url: str, *, body: dict[str, Any] | None, api_key: str, timeout: float) -> dict[str, Any]:
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if api_key:
        headers["X-HATAB-AI-Key"] = api_key
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        value = json.loads(response.read().decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object from {url}")
    return value


def run_endpoint(
    endpoint: str,
    cases: list[dict[str, Any]],
    *,
    api_key: str,
    timeout: float,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any] | None]:
    base_url = endpoint.rstrip("/")
    extract_url = base_url if base_url.endswith("/extract") else base_url + "/extract"
    health_url = extract_url[: -len("/extract")] + "/health"
    try:
        health = _request_json(health_url, body=None, api_key=api_key, timeout=min(timeout, 15.0))
    except (OSError, ValueError, urllib.error.HTTPError) as error:
        health = {"error": str(error)}
    predictions: dict[str, Any] = {}
    request_results: list[dict[str, Any]] = []
    for index, case in enumerate(cases, 1):
        started = time.perf_counter()
        try:
            response = _request_json(
                extract_url,
                body={
                    "message": case["message"],
                    "schemaVersion": CONTRACT.schema_version,
                    "contractVersion": CONTRACT.contract_version,
                    "contractHash": CONTRACT.semantic_sha256,
                },
                api_key=api_key,
                timeout=timeout,
            )
            prediction = {"actions": response.get("actions"), "unparsed": response.get("unparsed")}
            error = None
        except (OSError, ValueError, urllib.error.HTTPError) as caught:
            prediction = None
            error = str(caught)
        latency_ms = round((time.perf_counter() - started) * 1000)
        predictions[case["id"]] = prediction
        result = {"index": index, "id": case["id"], "latencyMs": latency_ms, "error": error}
        request_results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    return predictions, request_results, health


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Validate and score the HATAB bilingual golden intent suite")
    parser.add_argument("--golden", type=Path, default=base / "data" / "golden-evaluation.v2.jsonl")
    parser.add_argument("--contract-cases", type=Path, default=base / "data" / "golden-contract-cases.v2.jsonl")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--predictions", type=Path)
    source.add_argument("--endpoint")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--timeout", type=float, default=245.0)
    parser.add_argument("--scope", choices=("model", "pipeline"), default="model")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--output", type=Path, default=base / "reports" / "golden-evaluation-v2.json")
    parser.add_argument("--minimum-kind-rate", type=float, default=PROMOTION_MINIMUM_KIND_RATE)
    parser.add_argument("--minimum-exact-rate", type=float, default=PROMOTION_MINIMUM_EXACT_RATE)
    parser.add_argument("--minimum-abstention-rate", type=float, default=PROMOTION_MINIMUM_ABSTENTION_RATE)
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()

    golden = read_jsonl(args.golden)
    contract_cases = read_jsonl(args.contract_cases)
    golden_validation = validate_golden_cases(golden)
    contract_validation = validate_contract_cases(contract_cases)
    scope_cases = [case for case in golden if args.scope == "pipeline" or model_eligible(case)]
    if args.limit > 0:
        scope_cases = scope_cases[: args.limit]
    report: dict[str, Any] = {
        "schema": "hatab-local-ai-golden-suite-v2",
        **contract_metadata(),
        "promptSha256": prompt_sha256(),
        "goldenFixture": fixture_metadata(args.golden, golden),
        "contractFixture": fixture_metadata(args.contract_cases, contract_cases),
        "goldenValidation": golden_validation,
        "contractValidation": contract_validation,
        "scope": args.scope,
        "scopeCases": len(scope_cases),
        "modelEligibleCases": sum(model_eligible(case) for case in golden),
    }
    failed = not golden_validation["valid"] or not contract_validation["valid"]

    predictions: dict[str, Any] | None = None
    if args.predictions:
        predictions = read_predictions(args.predictions)
        report["predictionSource"] = {"type": "file", "path": str(args.predictions.resolve())}
    elif args.endpoint:
        predictions, requests, health = run_endpoint(
            args.endpoint,
            scope_cases,
            api_key=args.api_key,
            timeout=args.timeout,
        )
        report["predictionSource"] = {"type": "endpoint", "url": args.endpoint}
        report["endpointHealth"] = health
        report["requests"] = requests

    if predictions is not None:
        allowed = MODEL_ENABLED_KINDS if args.scope == "model" else REGISTERED_KINDS
        evaluation = evaluation_report(
            scope_cases,
            predictions,
            allowed_kinds=allowed,
            evaluation_scope=args.scope,
        )
        report["evaluation"] = evaluation
        metrics = evaluation["metrics"]
        gates = {
            "allPredictionsPresent": not evaluation["missingPredictionIds"],
            "contractValidRate": metrics.get("contractValidRate", 0.0) == 1.0,
            "actionKindExactRate": metrics.get("actionKindsExactRate", 0.0) >= args.minimum_kind_rate,
            "exactMatchRate": metrics.get("exactMatchRate", 0.0) >= args.minimum_exact_rate,
            "abstentionCorrectRate": metrics.get("abstentionCorrectRate", 0.0) >= args.minimum_abstention_rate,
            "multiActionExactRate": (
                metrics.get("multiActionSamples", 0) > 0
                and metrics.get("multiActionExactRate", 0.0) == 1.0
            ),
        }
        report["gateThresholds"] = {
            "contractValidRate": 1.0,
            "actionKindExactRate": args.minimum_kind_rate,
            "exactMatchRate": args.minimum_exact_rate,
            "abstentionCorrectRate": args.minimum_abstention_rate,
            "multiActionExactRate": 1.0,
        }
        report["gates"] = gates
        report["passed"] = not failed and all(gates.values())
        failed = not report["passed"]
    else:
        report["passed"] = not failed

    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    if failed and not args.report_only:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
