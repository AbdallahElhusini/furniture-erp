from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


LOCAL_AI = Path(__file__).resolve().parents[1]
if str(LOCAL_AI) not in sys.path:
    sys.path.insert(0, str(LOCAL_AI))

from contract import CONTRACT, MODEL_ENABLED_KINDS, contract_metadata, sha256_file  # noqa: E402
from base_model_provenance import (  # noqa: E402
    PINNED_BASE_MODEL,
    PINNED_BASE_MODEL_REVISION,
    derive_base_model_provenance,
)
from model_readiness import adapter_check, evaluation_check  # noqa: E402
from evaluation_core import (  # noqa: E402
    golden_fixture_identity,
    model_eligible,
    promotion_gate_thresholds,
    promotion_gates,
    read_jsonl,
)
from prompt import prompt_sha256  # noqa: E402
from sampling import ABSTENTION_BUCKET, BALANCED_POLICY, MULTI_ACTION_BUCKET  # noqa: E402


class ModelReadinessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.adapter = self.base / "adapter"
        self.adapter.mkdir()
        self.model = self.adapter / "adapter_model.safetensors"
        self.config = self.adapter / "adapter_config.json"
        self.manifest_path = self.adapter / "hatab-training-manifest.json"
        self.model.write_bytes(b"test-model")
        self.config.write_text('{"test":true}\n', encoding="utf-8")
        self.snapshot = self.base / "snapshot"
        self.snapshot.mkdir()
        (self.snapshot / "config.json").write_text('{"model_type":"qwen3"}\n', encoding="utf-8")
        (self.snapshot / "model.safetensors").write_bytes(b"pinned-base-model")
        (self.snapshot / "tokenizer.json").write_text('{"version":"1.0"}\n', encoding="utf-8")
        self.base_provenance = derive_base_model_provenance(
            self.snapshot,
            base_model=PINNED_BASE_MODEL,
            revision=PINNED_BASE_MODEL_REVISION,
        )
        counts = {kind: 2 for kind in MODEL_ENABLED_KINDS}
        counts[ABSTENTION_BUCKET] = 2
        counts[MULTI_ACTION_BUCKET] = 2
        self.manifest = {
            "schema": "hatab-erp-intent-lora-v2",
            "baseModel": PINNED_BASE_MODEL,
            "baseModelRevision": PINNED_BASE_MODEL_REVISION,
            "baseModelFilesSha256": self.base_provenance["baseModelFilesSha256"],
            "baseModelArtifactSha256": self.base_provenance["baseModelArtifactSha256"],
            "adapterModelSha256": sha256_file(self.model),
            "adapterConfigSha256": sha256_file(self.config),
            "datasetKinds": sorted(MODEL_ENABLED_KINDS),
            "modelEnabledKindsAtTraining": sorted(MODEL_ENABLED_KINDS),
            "promptSha256": prompt_sha256(),
            **contract_metadata(),
            "runtime": {
                "pythonVersion": "3.12.0",
                "torchVersion": "2.5.1",
                "transformersVersion": "4.55.0",
                "peftVersion": "0.17.0",
            },
            "sampling": {
                "policy": BALANCED_POLICY,
                "sourceBucketCounts": counts,
                "sampledBucketCounts": counts,
                "sourceRows": sum(counts.values()),
                "sampledRows": sum(counts.values()),
                "targetRowsPerBucket": 2,
                "bucketWeights": {bucket: 1 for bucket in counts},
                "weightedCycleSize": len(counts),
                "requiredKinds": sorted(MODEL_ENABLED_KINDS),
                "observedKinds": sorted(MODEL_ENABLED_KINDS),
                "abstentionRequired": True,
                "abstentionPresent": True,
                "orderSha256": "0" * 64,
            },
        }
        self._write_manifest()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write_manifest(self) -> None:
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def _adapter_check(self, **kwargs: object) -> dict[str, object]:
        with mock.patch("model_readiness.require_approved_base_model_provenance", return_value=None):
            return adapter_check(self.adapter, **kwargs)

    def _evaluation_report(self) -> dict[str, object]:
        golden_path = LOCAL_AI / "data" / "golden-evaluation.v2.jsonl"
        golden = read_jsonl(golden_path)
        identity = golden_fixture_identity(golden_path, golden)
        eligible_ids = [case["id"] for case in golden if model_eligible(case)]
        metrics = {
            "samples": len(eligible_ids),
            "contractValidRate": 1.0,
            "actionKindsExactRate": 1.0,
            "exactMatchRate": 1.0,
            "abstentionCorrectRate": 1.0,
            "multiActionSamples": sum(
                len(case["expected"]["actions"]) >= 2 for case in golden if model_eligible(case)
            ),
            "multiActionExactRate": 1.0,
        }
        return {
            "schema": "hatab-local-ai-golden-evaluation-v2",
            "baseModel": PINNED_BASE_MODEL,
            "baseModelRevision": PINNED_BASE_MODEL_REVISION,
            "baseModelFilesSha256": self.base_provenance["baseModelFilesSha256"],
            "baseModelArtifactSha256": self.base_provenance["baseModelArtifactSha256"],
            "contractSha256": CONTRACT.semantic_sha256,
            "runtimePromptSha256": prompt_sha256(),
            "adapterPath": str(self.adapter.resolve()),
            "adapterManifestSha256": sha256_file(self.manifest_path),
            "datasetPath": str(golden_path.resolve()),
            "datasetSha256": identity["goldenFixtureSha256"],
            "goldenFixture": True,
            **identity,
            "evaluationScope": "model-enabled",
            "selectedKinds": [],
            "naturalOnly": False,
            "evaluatedCaseCount": len(eligible_ids),
            "evaluatedCaseIds": eligible_ids,
            "missingPredictionIds": [],
            "unexpectedPredictionIds": [],
            "results": [{"id": case_id} for case_id in eligible_ids],
            "metrics": metrics,
            "gateThresholds": promotion_gate_thresholds(),
            "gates": promotion_gates(metrics),
            "passed": True,
        }

    def test_complete_v2_manifest_is_ready_and_reports_artifact_hashes(self) -> None:
        result = self._adapter_check(base_snapshot_path=self.snapshot)
        self.assertTrue(result["ready"], result["blockers"])
        self.assertEqual(result["manifestSha256"], sha256_file(self.manifest_path))
        self.assertEqual(result["modelSha256"], sha256_file(self.model))
        self.assertEqual(result["configSha256"], sha256_file(self.config))
        self.assertEqual(result["contractSha256"], CONTRACT.semantic_sha256)
        self.assertEqual(result["baseModelRevision"], PINNED_BASE_MODEL_REVISION)
        self.assertEqual(
            result["baseModelArtifactSha256"],
            self.base_provenance["baseModelArtifactSha256"],
        )
        self.assertTrue(result["baseModelSnapshotVerified"])

    def test_missing_or_tampered_base_snapshot_provenance_blocks_promotion(self) -> None:
        del self.manifest["baseModelRevision"]
        self._write_manifest()
        missing = self._adapter_check(base_snapshot_path=self.snapshot)
        self.assertFalse(missing["ready"])
        self.assertIn("adapter.base_model_revision_missing_or_mismatch", missing["blockers"])

        self.manifest["baseModelRevision"] = PINNED_BASE_MODEL_REVISION
        self._write_manifest()
        (self.snapshot / "tokenizer.json").write_text('{"version":"tampered"}\n', encoding="utf-8")
        tampered = self._adapter_check(base_snapshot_path=self.snapshot)
        self.assertFalse(tampered["ready"])
        self.assertIn("adapter.base_model_snapshot_files_mismatch", tampered["blockers"])
        self.assertIn("adapter.base_model_snapshot_artifact_mismatch", tampered["blockers"])

    def test_readiness_blocks_a_snapshot_outside_the_approved_hash_policy(self) -> None:
        with mock.patch(
            "model_readiness.require_approved_base_model_provenance",
            side_effect=ValueError("aggregate mismatch"),
        ):
            result = adapter_check(self.adapter, base_snapshot_path=self.snapshot)
        self.assertFalse(result["ready"])
        self.assertIn(
            "adapter.base_model_snapshot_not_approved:aggregate mismatch",
            result["blockers"],
        )

    def test_unsafe_or_incomplete_sampling_blocks_promotion(self) -> None:
        self.manifest["sampling"]["policy"] = "natural"
        del self.manifest["sampling"]["sourceBucketCounts"]["CREATE_TASK"]
        self._write_manifest()
        result = self._adapter_check(base_snapshot_path=self.snapshot)
        self.assertFalse(result["ready"])
        self.assertIn("adapter.sampling_policy_missing_or_unsafe", result["blockers"])
        self.assertIn(
            "adapter.sampling_missing_model_kind_coverage:CREATE_TASK",
            result["blockers"],
        )

    def test_evaluation_is_bound_to_exact_adapter_manifest(self) -> None:
        report_path = self.base / "evaluation.json"
        report = self._evaluation_report()
        report_path.write_text(json.dumps(report), encoding="utf-8")
        self.assertTrue(evaluation_check(report_path, self.adapter)["ready"])

        without_revision = dict(report)
        del without_revision["baseModelRevision"]
        report_path.write_text(json.dumps(without_revision), encoding="utf-8")
        missing_revision = evaluation_check(report_path, self.adapter)
        self.assertFalse(missing_revision["ready"])
        self.assertIn(
            "evaluation.base_model_revision_missing_or_mismatch",
            missing_revision["blockers"],
        )

        report_path.write_text(json.dumps(report), encoding="utf-8")
        self.manifest["seed"] = 99
        self._write_manifest()
        result = evaluation_check(report_path, self.adapter)
        self.assertFalse(result["ready"])
        self.assertIn("evaluation.adapter_manifest_hash_missing_or_mismatch", result["blockers"])

    def test_evaluation_rejects_subset_duplicate_and_golden_drift(self) -> None:
        report_path = self.base / "evaluation.json"
        valid = self._evaluation_report()

        subset = json.loads(json.dumps(valid))
        subset["evaluatedCaseIds"] = subset["evaluatedCaseIds"][:-1]
        subset["evaluatedCaseCount"] -= 1
        subset["results"] = subset["results"][:-1]
        subset["metrics"]["samples"] -= 1
        report_path.write_text(json.dumps(subset), encoding="utf-8")
        result = evaluation_check(report_path, self.adapter)
        self.assertFalse(result["ready"])
        self.assertIn("evaluation.case_id_set_mismatch", result["blockers"])
        self.assertIn("evaluation.result_id_set_mismatch", result["blockers"])

        duplicate = json.loads(json.dumps(valid))
        duplicate["evaluatedCaseIds"][-1] = duplicate["evaluatedCaseIds"][0]
        duplicate["results"][-1]["id"] = duplicate["results"][0]["id"]
        report_path.write_text(json.dumps(duplicate), encoding="utf-8")
        result = evaluation_check(report_path, self.adapter)
        self.assertFalse(result["ready"])
        self.assertIn("evaluation.duplicate_case_ids", result["blockers"])
        self.assertIn("evaluation.duplicate_result_ids", result["blockers"])

        drifted = json.loads(json.dumps(valid))
        drifted["goldenSemanticSha256"] = "0" * 64
        report_path.write_text(json.dumps(drifted), encoding="utf-8")
        result = evaluation_check(report_path, self.adapter)
        self.assertFalse(result["ready"])
        self.assertIn("evaluation.goldenSemanticSha256_missing_or_mismatch", result["blockers"])

    def test_evaluation_recomputes_code_pinned_gates(self) -> None:
        report_path = self.base / "evaluation.json"
        report = self._evaluation_report()
        report["gateThresholds"] = {
            "contractValidRate": 0.0,
            "actionKindExactRate": 0.0,
            "exactMatchRate": 0.0,
            "abstentionCorrectRate": 0.0,
            "multiActionExactRate": 0.0,
        }
        report["metrics"]["exactMatchRate"] = 0.0
        report["gates"] = {
            "contractValidRate": True,
            "actionKindExactRate": True,
            "exactMatchRate": True,
            "abstentionCorrectRate": True,
            "multiActionExactRate": True,
        }
        report_path.write_text(json.dumps(report), encoding="utf-8")
        result = evaluation_check(report_path, self.adapter)
        self.assertFalse(result["ready"])
        self.assertIn("evaluation.thresholds_missing_or_mismatch", result["blockers"])
        self.assertIn("evaluation.gates_missing_or_mismatch", result["blockers"])
        self.assertIn("evaluation.gates_not_passed", result["blockers"])


if __name__ == "__main__":
    unittest.main()
