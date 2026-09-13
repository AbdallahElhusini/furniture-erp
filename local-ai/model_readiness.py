from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from base_model_provenance import (
    PINNED_BASE_MODEL,
    PINNED_BASE_MODEL_REVISION,
    cached_base_model_provenance,
    canonical_files_sha256,
    derive_base_model_provenance,
    require_approved_base_model_provenance,
    valid_files_sha256,
)
from contract import MODEL_ENABLED_KINDS, REGISTERED_KINDS, CONTRACT, contract_metadata, sha256_file
from dataset_validation import validate_dataset
from evaluation_core import (
    golden_fixture_identity,
    promotion_gate_thresholds,
    promotion_gates,
    read_jsonl,
    validate_contract_cases,
    validate_golden_cases,
)
from prompt import prompt_sha256
from sampling import ABSTENTION_BUCKET, BALANCED_POLICY, MULTI_ACTION_BUCKET


def read_object(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def adapter_check(
    path: Path,
    *,
    verify_base_snapshot: bool = False,
    base_snapshot_path: Path | None = None,
) -> dict[str, Any]:
    blockers: list[str] = []
    manifest_path = path / "hatab-training-manifest.json"
    model_path = path / "adapter_model.safetensors"
    config_path = path / "adapter_config.json"
    manifest = read_object(manifest_path)
    observed_base_provenance: dict[str, Any] | None = None
    if not path.is_dir():
        blockers.append("adapter.directory_missing")
    if manifest is None:
        blockers.append("adapter.manifest_missing_or_invalid")
    else:
        if manifest.get("schema") != "hatab-erp-intent-lora-v2":
            blockers.append("adapter.manifest_schema_missing_or_mismatch")
        base_model = manifest.get("baseModel")
        base_model_revision = manifest.get("baseModelRevision")
        base_model_files = manifest.get("baseModelFilesSha256")
        base_model_artifact = manifest.get("baseModelArtifactSha256")
        if base_model != PINNED_BASE_MODEL:
            blockers.append("adapter.base_model_missing_or_mismatch")
        if base_model_revision != PINNED_BASE_MODEL_REVISION:
            blockers.append("adapter.base_model_revision_missing_or_mismatch")
        files_valid = valid_files_sha256(base_model_files)
        if not files_valid:
            blockers.append("adapter.base_model_files_hashes_missing_or_invalid")
        if (
            not isinstance(base_model_artifact, str)
            or not files_valid
            or base_model_artifact != canonical_files_sha256(base_model_files)
        ):
            blockers.append("adapter.base_model_artifact_hash_missing_or_mismatch")
        if base_model_revision == PINNED_BASE_MODEL_REVISION and files_valid:
            try:
                require_approved_base_model_provenance({
                    "baseModelRevision": base_model_revision,
                    "baseModelFilesSha256": base_model_files,
                    "baseModelArtifactSha256": base_model_artifact,
                })
            except ValueError as error:
                blockers.append(f"adapter.base_model_manifest_not_approved:{error}")
        if (
            (verify_base_snapshot or base_snapshot_path is not None)
            and base_model == PINNED_BASE_MODEL
            and base_model_revision == PINNED_BASE_MODEL_REVISION
            and files_valid
        ):
            try:
                observed_base_provenance = (
                    derive_base_model_provenance(
                        base_snapshot_path,
                        base_model=base_model,
                        revision=base_model_revision,
                    )
                    if base_snapshot_path is not None
                    else cached_base_model_provenance(base_model, base_model_revision)
                )
            except (OSError, ValueError) as error:
                blockers.append(f"adapter.base_model_snapshot_unavailable:{error}")
            else:
                try:
                    require_approved_base_model_provenance(observed_base_provenance)
                except ValueError as error:
                    blockers.append(f"adapter.base_model_snapshot_not_approved:{error}")
                if base_model_files != observed_base_provenance["baseModelFilesSha256"]:
                    blockers.append("adapter.base_model_snapshot_files_mismatch")
                if base_model_artifact != observed_base_provenance["baseModelArtifactSha256"]:
                    blockers.append("adapter.base_model_snapshot_artifact_mismatch")
        if not model_path.is_file() or manifest.get("adapterModelSha256") != sha256_file(model_path):
            blockers.append("adapter.model_artifact_hash_missing_or_mismatch")
        if not config_path.is_file() or manifest.get("adapterConfigSha256") != sha256_file(config_path):
            blockers.append("adapter.config_artifact_hash_missing_or_mismatch")
        if manifest.get("contractSha256") != CONTRACT.semantic_sha256:
            blockers.append("adapter.contract_hash_missing_or_mismatch")
        if manifest.get("promptSha256") != prompt_sha256():
            blockers.append("adapter.prompt_hash_missing_or_mismatch")
        kinds = manifest.get("datasetKinds")
        if not isinstance(kinds, list) or not all(isinstance(kind, str) for kind in kinds):
            blockers.append("adapter.dataset_kinds_missing_or_invalid")
        else:
            kind_set = set(kinds)
            missing = MODEL_ENABLED_KINDS - kind_set
            if missing:
                blockers.append("adapter.missing_model_kind_coverage:" + ",".join(sorted(missing)))
            unknown = kind_set - REGISTERED_KINDS
            if unknown:
                blockers.append("adapter.unregistered_dataset_kinds:" + ",".join(sorted(unknown)))
        trained_enabled = manifest.get("modelEnabledKindsAtTraining")
        if (
            not isinstance(trained_enabled, list)
            or not all(isinstance(kind, str) for kind in trained_enabled)
            or set(trained_enabled) != MODEL_ENABLED_KINDS
        ):
            blockers.append("adapter.model_enabled_kinds_drift")
        if manifest.get("schemaVersion") != CONTRACT.schema_version:
            blockers.append("adapter.schema_version_missing_or_mismatch")
        runtime = manifest.get("runtime")
        if not isinstance(runtime, dict) or any(
            not isinstance(runtime.get(key), str) or not runtime[key].strip()
            for key in ("pythonVersion", "torchVersion", "transformersVersion", "peftVersion")
        ):
            blockers.append("adapter.runtime_metadata_missing_or_invalid")
        sampling = manifest.get("sampling")
        if not isinstance(sampling, dict):
            blockers.append("adapter.sampling_metadata_missing_or_invalid")
        else:
            if sampling.get("policy") != BALANCED_POLICY:
                blockers.append("adapter.sampling_policy_missing_or_unsafe")
            source_counts = sampling.get("sourceBucketCounts")
            sampled_counts = sampling.get("sampledBucketCounts")
            bucket_weights = sampling.get("bucketWeights")
            if not isinstance(source_counts, dict) or not all(
                isinstance(key, str) and isinstance(value, int) and not isinstance(value, bool) and value > 0
                for key, value in source_counts.items()
            ):
                blockers.append("adapter.sampling_source_counts_missing_or_invalid")
            else:
                missing_source = MODEL_ENABLED_KINDS - set(source_counts)
                if missing_source:
                    blockers.append(
                        "adapter.sampling_missing_model_kind_coverage:" + ",".join(sorted(missing_source))
                    )
                if ABSTENTION_BUCKET not in source_counts:
                    blockers.append("adapter.sampling_abstention_missing")
                if MULTI_ACTION_BUCKET not in source_counts:
                    blockers.append("adapter.sampling_multi_action_missing")
                if sampling.get("sourceRows") != sum(source_counts.values()):
                    blockers.append("adapter.sampling_source_row_count_mismatch")
            if not isinstance(sampled_counts, dict) or not sampled_counts or not all(
                isinstance(key, str) and isinstance(value, int) and not isinstance(value, bool) and value > 0
                for key, value in sampled_counts.items()
            ):
                blockers.append("adapter.sampling_sampled_counts_missing_or_invalid")
            else:
                if isinstance(source_counts, dict) and set(sampled_counts) != set(source_counts):
                    blockers.append("adapter.sampling_bucket_set_mismatch")
                if sampling.get("sampledRows") != sum(sampled_counts.values()):
                    blockers.append("adapter.sampling_sampled_row_count_mismatch")
                if (
                    not isinstance(bucket_weights, dict)
                    or set(bucket_weights) != set(sampled_counts)
                    or not all(
                        isinstance(key, str)
                        and isinstance(value, int)
                        and not isinstance(value, bool)
                        and value > 0
                        for key, value in bucket_weights.items()
                    )
                ):
                    blockers.append("adapter.sampling_bucket_weights_missing_or_invalid")
                else:
                    target = sampling.get("targetRowsPerBucket")
                    if not isinstance(target, int) or isinstance(target, bool) or target < 1:
                        blockers.append("adapter.sampling_target_count_mismatch")
                    elif any(
                        sampled_counts[bucket] != target * bucket_weights[bucket]
                        for bucket in sampled_counts
                    ):
                        blockers.append("adapter.sampling_weighted_buckets_not_balanced")
                    if sampling.get("weightedCycleSize") != sum(bucket_weights.values()):
                        blockers.append("adapter.sampling_weighted_cycle_size_mismatch")
            required_kinds = sampling.get("requiredKinds")
            if (
                not isinstance(required_kinds, list)
                or not all(isinstance(kind, str) for kind in required_kinds)
                or set(required_kinds) != MODEL_ENABLED_KINDS
            ):
                blockers.append("adapter.sampling_required_kinds_drift")
            observed_kinds = sampling.get("observedKinds")
            if (
                not isinstance(observed_kinds, list)
                or not all(isinstance(kind, str) for kind in observed_kinds)
                or not MODEL_ENABLED_KINDS.issubset(set(observed_kinds))
            ):
                blockers.append("adapter.sampling_observed_kinds_incomplete")
            if sampling.get("abstentionRequired") is not True or sampling.get("abstentionPresent") is not True:
                blockers.append("adapter.sampling_abstention_gate_missing")
            order_hash = sampling.get("orderSha256")
            if not isinstance(order_hash, str) or len(order_hash) != 64 or any(
                character not in "0123456789abcdef" for character in order_hash.casefold()
            ):
                blockers.append("adapter.sampling_order_hash_missing_or_invalid")
    return {
        "path": str(path.resolve()),
        "manifestPath": str(manifest_path.resolve()),
        "manifestSha256": sha256_file(manifest_path) if manifest_path.is_file() else None,
        "modelPath": str(model_path.resolve()),
        "modelSha256": sha256_file(model_path) if model_path.is_file() else None,
        "configPath": str(config_path.resolve()),
        "configSha256": sha256_file(config_path) if config_path.is_file() else None,
        "baseModel": manifest.get("baseModel") if manifest else None,
        "baseModelRevision": manifest.get("baseModelRevision") if manifest else None,
        "baseModelFilesSha256": manifest.get("baseModelFilesSha256") if manifest else None,
        "baseModelArtifactSha256": manifest.get("baseModelArtifactSha256") if manifest else None,
        "baseModelSnapshotPath": observed_base_provenance.get("baseModelSnapshotPath")
        if observed_base_provenance else None,
        "baseModelSnapshotVerified": bool(
            observed_base_provenance
            and manifest
            and manifest.get("baseModelFilesSha256") == observed_base_provenance["baseModelFilesSha256"]
            and manifest.get("baseModelArtifactSha256") == observed_base_provenance["baseModelArtifactSha256"]
        ),
        "runtime": manifest.get("runtime") if manifest else None,
        "contractSha256": manifest.get("contractSha256") if manifest else None,
        "promptSha256": manifest.get("promptSha256") if manifest else None,
        "sampling": manifest.get("sampling") if manifest else None,
        "ready": not blockers,
        "blockers": blockers,
        "manifest": manifest,
    }


def evaluation_check(
    path: Path,
    adapter_path: Path,
    *,
    golden_path: Path | None = None,
) -> dict[str, Any]:
    blockers: list[str] = []
    report = read_object(path)
    canonical_golden_path = (
        golden_path or Path(__file__).resolve().parent / "data" / "golden-evaluation.v2.jsonl"
    ).resolve()
    try:
        golden_cases = read_jsonl(canonical_golden_path)
        golden_validation = validate_golden_cases(golden_cases)
    except (OSError, ValueError) as error:
        golden_cases = []
        golden_validation = {"valid": False, "errors": [str(error)]}
        golden_identity: dict[str, Any] = {}
        blockers.append(f"evaluation.current_golden_unavailable:{error}")
    else:
        golden_identity = golden_fixture_identity(canonical_golden_path, golden_cases)
        if not golden_validation["valid"]:
            blockers.append("evaluation.current_golden_invalid")
    expected_ids = set(golden_identity.get("goldenEligibleCaseIds", []))
    if report is None:
        blockers.append("evaluation.report_missing_or_invalid")
    else:
        if report.get("contractSha256") != CONTRACT.semantic_sha256:
            blockers.append("evaluation.contract_hash_missing_or_mismatch")
        if report.get("runtimePromptSha256", report.get("promptSha256")) != prompt_sha256():
            blockers.append("evaluation.prompt_hash_missing_or_mismatch")
        if Path(str(report.get("adapterPath", ""))).resolve() != adapter_path.resolve():
            blockers.append("evaluation.adapter_path_mismatch")
        adapter_manifest_path = adapter_path / "hatab-training-manifest.json"
        expected_manifest_hash = sha256_file(adapter_manifest_path) if adapter_manifest_path.is_file() else None
        if report.get("adapterManifestSha256") != expected_manifest_hash:
            blockers.append("evaluation.adapter_manifest_hash_missing_or_mismatch")
        if report.get("goldenFixture") is not True:
            blockers.append("evaluation.not_canonical_golden_fixture")
        try:
            report_dataset_path = Path(str(report.get("datasetPath", ""))).resolve()
        except (OSError, ValueError):
            report_dataset_path = Path()
        if report_dataset_path != canonical_golden_path:
            blockers.append("evaluation.golden_path_missing_or_mismatch")
        for field in (
            "goldenFixtureSha256",
            "goldenSemanticSha256",
            "goldenTotalCaseCount",
            "goldenEligibleCaseCount",
            "goldenEligibleCaseIds",
        ):
            if report.get(field) != golden_identity.get(field):
                blockers.append(f"evaluation.{field}_missing_or_mismatch")
        if report.get("datasetSha256") != golden_identity.get("goldenFixtureSha256"):
            blockers.append("evaluation.dataset_hash_missing_or_mismatch")
        if report.get("evaluationScope") != "model-enabled":
            blockers.append("evaluation.scope_missing_or_unsafe")
        if report.get("selectedKinds") != []:
            blockers.append("evaluation.kind_filter_present")
        if report.get("naturalOnly") is not False:
            blockers.append("evaluation.natural_filter_present")

        evaluated_ids = report.get("evaluatedCaseIds")
        if not isinstance(evaluated_ids, list) or not all(isinstance(value, str) for value in evaluated_ids):
            blockers.append("evaluation.case_ids_missing_or_invalid")
            evaluated_ids = []
        elif len(evaluated_ids) != len(set(evaluated_ids)):
            blockers.append("evaluation.duplicate_case_ids")
        if set(evaluated_ids) != expected_ids:
            blockers.append("evaluation.case_id_set_mismatch")
        if report.get("evaluatedCaseCount") != len(expected_ids) or len(evaluated_ids) != len(expected_ids):
            blockers.append("evaluation.case_count_missing_or_mismatch")

        results = report.get("results")
        if not isinstance(results, list) or not all(
            isinstance(result, dict) and isinstance(result.get("id"), str) for result in results
        ):
            blockers.append("evaluation.results_missing_or_invalid")
            result_ids: list[str] = []
        else:
            result_ids = [result["id"] for result in results]
            if len(result_ids) != len(set(result_ids)):
                blockers.append("evaluation.duplicate_result_ids")
        if set(result_ids) != expected_ids or len(result_ids) != len(expected_ids):
            blockers.append("evaluation.result_id_set_mismatch")
        if report.get("missingPredictionIds") != []:
            blockers.append("evaluation.missing_predictions")
        if report.get("unexpectedPredictionIds") != []:
            blockers.append("evaluation.unexpected_predictions")

        metrics = report.get("metrics")
        expected_thresholds = promotion_gate_thresholds()
        if report.get("gateThresholds") != expected_thresholds:
            blockers.append("evaluation.thresholds_missing_or_mismatch")
        if not isinstance(metrics, dict):
            blockers.append("evaluation.metrics_missing_or_invalid")
            recomputed_gates: dict[str, bool] = {}
        else:
            if metrics.get("samples") != len(expected_ids):
                blockers.append("evaluation.metric_sample_count_mismatch")
            recomputed_gates = promotion_gates(metrics)
        if report.get("gates") != recomputed_gates:
            blockers.append("evaluation.gates_missing_or_mismatch")
        manifest = read_object(adapter_manifest_path)
        if manifest is None:
            blockers.append("evaluation.adapter_manifest_missing_or_invalid")
        else:
            if report.get("baseModel") != manifest.get("baseModel"):
                blockers.append("evaluation.base_model_mismatch")
            if report.get("baseModelRevision") != manifest.get("baseModelRevision"):
                blockers.append("evaluation.base_model_revision_missing_or_mismatch")
            report_files = report.get("baseModelFilesSha256")
            if not valid_files_sha256(report_files) or report_files != manifest.get("baseModelFilesSha256"):
                blockers.append("evaluation.base_model_files_hashes_missing_or_mismatch")
            if report.get("baseModelArtifactSha256") != manifest.get("baseModelArtifactSha256"):
                blockers.append("evaluation.base_model_artifact_hash_missing_or_mismatch")
        if report.get("passed") is not True or not recomputed_gates or not all(recomputed_gates.values()):
            blockers.append("evaluation.gates_not_passed")
    return {
        "path": str(path.resolve()),
        "reportSha256": sha256_file(path) if path.is_file() else None,
        "passed": report.get("passed") if report else None,
        "contractSha256": report.get("contractSha256") if report else None,
        "promptSha256": report.get("runtimePromptSha256", report.get("promptSha256")) if report else None,
        "adapterManifestSha256": report.get("adapterManifestSha256") if report else None,
        "baseModel": report.get("baseModel") if report else None,
        "baseModelRevision": report.get("baseModelRevision") if report else None,
        "baseModelArtifactSha256": report.get("baseModelArtifactSha256") if report else None,
        "goldenFixtureSha256": report.get("goldenFixtureSha256") if report else None,
        "goldenSemanticSha256": report.get("goldenSemanticSha256") if report else None,
        "goldenEligibleCaseCount": report.get("goldenEligibleCaseCount") if report else None,
        "ready": not blockers,
        "blockers": blockers,
        "report": report,
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Produce a no-model-load HATAB local-AI promotion readiness report")
    parser.add_argument(
        "--adapter",
        type=Path,
        default=Path(r"D:\hatab-local-ai\artifacts\qwen3-0.6b-hatab-lora-candidate-v3-pinned-c1899de2"),
    )
    parser.add_argument("--evaluation-report", type=Path, default=base / "reports" / "adapter-candidate-golden-v2.json")
    parser.add_argument("--output", type=Path, default=base / "reports" / "model-readiness-v2.json")
    parser.add_argument("--require-ready", action="store_true")
    args = parser.parse_args()

    dataset = validate_dataset(
        base / "data" / "train.jsonl",
        base / "data" / "eval.jsonl",
        manifest_path=base / "data" / "manifest.json",
    )
    golden = validate_golden_cases(read_jsonl(base / "data" / "golden-evaluation.v2.jsonl"))
    contract_cases = validate_contract_cases(read_jsonl(base / "data" / "golden-contract-cases.v2.jsonl"))
    adapter = adapter_check(args.adapter, verify_base_snapshot=True)
    evaluation = evaluation_check(args.evaluation_report, args.adapter)
    blockers: list[str] = []
    if not dataset["valid"]:
        blockers.append("dataset.validation_failed")
    if not golden["valid"]:
        blockers.append("golden.validation_failed")
    if not contract_cases["valid"]:
        blockers.append("contract_fixture.validation_failed")
    blockers.extend(adapter["blockers"])
    blockers.extend(evaluation["blockers"])
    report = {
        "schema": "hatab-local-ai-model-readiness-v2",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        **contract_metadata(),
        "promptSha256": prompt_sha256(),
        "productionReady": not blockers,
        "blockers": blockers,
        "dataset": {
            "valid": dataset["valid"],
            "validationSha256": dataset["validationSha256"],
            "rows": {name: split["rows"] for name, split in dataset["splits"].items()},
            "missingCoverage": dataset["missingCoverage"],
            "crossSplitMessageCount": dataset["leakage"]["crossSplitMessageCount"],
        },
        "golden": golden,
        "contractCases": contract_cases,
        "adapter": adapter,
        "evaluation": evaluation,
    }
    report["readinessSha256"] = hashlib.sha256(
        json.dumps(
            {key: value for key, value in report.items() if key != "generatedAt"},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    if args.require_ready and not report["productionReady"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
