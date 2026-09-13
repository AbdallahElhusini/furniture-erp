from __future__ import annotations

import json
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import torch
from fastapi import HTTPException


LOCAL_AI_ROOT = Path(__file__).resolve().parents[1]
if str(LOCAL_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(LOCAL_AI_ROOT))

import serve  # noqa: E402
from contract import CONTRACT, sha256_file  # noqa: E402


class _Tokenizer:
    eos_token_id = 0

    def apply_chat_template(self, *_args, **_kwargs):
        return "prompt"

    def __call__(self, *_args, **_kwargs):
        return {"input_ids": torch.tensor([[1]])}

    def decode(self, *_args, **_kwargs):
        return "{}"


class _Model:
    def generate(self, **_kwargs):
        return torch.tensor([[1, 2]])


class ServePromotionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="hatab-serve-promotion-")
        self.addCleanup(self.temporary.cleanup)
        self.adapter_path = Path(self.temporary.name) / "adapter"
        self.adapter_path.mkdir()
        for name in ("adapter_model.safetensors", "adapter_config.json", "hatab-training-manifest.json"):
            (self.adapter_path / name).write_text("test", encoding="utf-8")
        self.evaluation_path = Path(self.temporary.name) / "golden-evaluation.json"
        self.hashes = {
            "model": "1" * 64,
            "config": "2" * 64,
            "manifest": "3" * 64,
            "prompt": "4" * 64,
            "readiness": "5" * 64,
        }
        self.base_model = "Qwen/Qwen3-0.6B"
        self.base_model_revision = "c1899de289a04d12100db370d81485cdf75e47ca"
        self.base_snapshot = Path(self.temporary.name) / "base-snapshot"
        self.base_snapshot.mkdir()
        (self.base_snapshot / "config.json").write_text("{}\n", encoding="utf-8")
        (self.base_snapshot / "model.safetensors").write_text("weights", encoding="utf-8")
        self.base_files = {
            candidate.name: sha256_file(candidate)
            for candidate in sorted(self.base_snapshot.iterdir())
        }
        self.base_artifact_hash = hashlib.sha256(
            json.dumps(self.base_files, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        self.evaluation = {
            "schema": "hatab-local-ai-golden-evaluation-v2",
            "passed": True,
            "gates": {"contract": True, "exactMatch": True},
            "adapterPath": str(self.adapter_path.resolve()),
            "baseModel": self.base_model,
            "adapterManifestSha256": self.hashes["manifest"],
            "contractSha256": CONTRACT.semantic_sha256,
            "runtimePromptSha256": self.hashes["prompt"],
        }
        self.evaluation_path.write_text(json.dumps(self.evaluation), encoding="utf-8")
        self.evaluation_hash = sha256_file(self.evaluation_path)
        self.identity_hash = "6" * 64
        self.check = {
            "blockers": [],
            "ready": True,
            "manifest": {
                "schema": "hatab-erp-intent-lora-v2",
                "baseModelRevision": self.base_model_revision,
                "baseModelFilesSha256": self.base_files,
                "baseModelArtifactSha256": self.base_artifact_hash,
            },
            "manifestSha256": self.hashes["manifest"],
            "modelSha256": self.hashes["model"],
            "configSha256": self.hashes["config"],
            "baseModel": self.base_model,
            "runtime": {"pythonVersion": "3.12"},
            "sampling": {"policy": "balanced-per-operation-v1"},
        }
        self.originals = {
            name: getattr(serve, name)
            for name in (
                "ADAPTER_PATH",
                "BASE_MODEL",
                "ACTIVE_MODEL_KEY",
                "ACTIVE_MARKER_PATH",
                "EXPECTED_IDENTITY_SHA256",
                "BASE_MODEL_REVISION",
                "EXPECTED_BASE_ARTIFACT_SHA256",
                "EXPECTED_MODEL_SHA256",
                "EXPECTED_CONFIG_SHA256",
                "EXPECTED_MANIFEST_SHA256",
                "EXPECTED_EVALUATION_PATH",
                "EXPECTED_EVALUATION_SHA256",
                "EXPECTED_CONTRACT_SHA256",
                "EXPECTED_PROMPT_SHA256",
                "EXPECTED_READINESS_SHA256",
                "API_KEY",
            )
        }
        self.addCleanup(self._restore_globals)
        serve.ADAPTER_PATH = self.adapter_path
        serve.BASE_MODEL = self.base_model
        serve.BASE_MODEL_REVISION = self.base_model_revision
        serve.ACTIVE_MODEL_KEY = "hatab-local-1234567890abcdef12345678"
        serve.EXPECTED_IDENTITY_SHA256 = self.identity_hash
        serve.EXPECTED_BASE_ARTIFACT_SHA256 = self.base_artifact_hash
        serve.EXPECTED_MODEL_SHA256 = self.hashes["model"]
        serve.EXPECTED_CONFIG_SHA256 = self.hashes["config"]
        serve.EXPECTED_MANIFEST_SHA256 = self.hashes["manifest"]
        serve.EXPECTED_EVALUATION_PATH = self.evaluation_path
        serve.EXPECTED_EVALUATION_SHA256 = self.evaluation_hash
        serve.EXPECTED_CONTRACT_SHA256 = CONTRACT.semantic_sha256
        serve.EXPECTED_PROMPT_SHA256 = self.hashes["prompt"]
        serve.EXPECTED_READINESS_SHA256 = self.hashes["readiness"]
        serve.API_KEY = "test-secret-which-is-at-least-32-characters"
        serve.runtime.base_model_snapshot = self.base_snapshot
        serve.runtime.base_model_files_sha256 = self.base_files
        serve.runtime.base_model_artifact_sha256 = self.base_artifact_hash
        self.active_marker_path = Path(self.temporary.name) / "active-model.json"
        active_marker = {
            "schema": "hatab-local-ai-active-model-v1",
            "activeModelKey": serve.ACTIVE_MODEL_KEY,
            "modelIdentitySha256": self.identity_hash,
            "baseModel": self.base_model,
            "baseModelRevision": self.base_model_revision,
            "baseModelArtifactSha256": self.base_artifact_hash,
            "adapterModelSha256": self.hashes["model"],
            "adapterConfigSha256": self.hashes["config"],
            "adapterManifestSha256": self.hashes["manifest"],
            "evaluationReportSha256": self.evaluation_hash,
            "contractSha256": CONTRACT.semantic_sha256,
            "promptSha256": self.hashes["prompt"],
            "adapter": str(self.adapter_path.resolve()),
        }
        self.active_marker_path.write_text(json.dumps(active_marker), encoding="utf-8")
        serve.ACTIVE_MARKER_PATH = self.active_marker_path
        serve.runtime.model = _Model()
        serve.runtime.tokenizer = _Tokenizer()

    def _restore_globals(self) -> None:
        for name, value in self.originals.items():
            setattr(serve, name, value)
        serve.runtime.model = None
        serve.runtime.tokenizer = None
        serve.runtime.base_model_snapshot = None
        serve.runtime.base_model_files_sha256 = None
        serve.runtime.base_model_artifact_sha256 = None

    def assert_identity(self, response: dict) -> None:
        self.assertEqual(response["activeModelKey"], serve.ACTIVE_MODEL_KEY)
        self.assertEqual(response["baseModel"], self.base_model)
        self.assertEqual(response["baseModelRevision"], self.base_model_revision)
        self.assertEqual(response["baseModelArtifactSha256"], self.base_artifact_hash)
        self.assertEqual(response["modelIdentitySha256"], self.identity_hash)
        self.assertEqual(response["adapter"], str(self.adapter_path.resolve()))
        self.assertEqual(response["adapterModelSha256"], self.hashes["model"])
        self.assertEqual(response["adapterConfigSha256"], self.hashes["config"])
        self.assertEqual(response["adapterManifestSha256"], self.hashes["manifest"])
        self.assertEqual(response["evaluationReportSha256"], self.evaluation_hash)
        self.assertEqual(response["promptSha256"], self.hashes["prompt"])
        self.assertIs(response["promotionVerified"], True)

    def test_health_and_extract_emit_the_exact_promoted_identity(self) -> None:
        with (
            mock.patch.object(serve, "adapter_check", return_value=self.check),
            mock.patch.object(serve, "prompt_sha256", return_value=self.hashes["prompt"]),
            mock.patch.object(serve, "require_approved_base_model_provenance"),
        ):
            health = serve.health(serve.API_KEY)
            self.assertEqual(health["status"], "ready")
            self.assertIs(health["productionReady"], True)
            self.assert_identity(health)

            request = serve.ExtractRequest(
                message="test",
                schemaVersion=CONTRACT.schema_version,
                contractVersion=CONTRACT.contract_version,
                contractHash=CONTRACT.semantic_sha256,
            )
            with mock.patch.object(
                serve,
                "strict_result",
                return_value={"actions": [{"kind": "test"}], "unparsed": []},
            ):
                extracted = serve.extract(request, serve.API_KEY)
            self.assert_identity(extracted)
            self.assertEqual(extracted["contractHash"], CONTRACT.semantic_sha256)
            self.assertEqual(extracted["generation"]["stopReason"], "complete_json")
            self.assertTrue(extracted["generation"]["completeJson"])

    def test_tampered_evaluation_or_model_hash_cannot_report_ready_or_extract(self) -> None:
        self.evaluation_path.write_text("{}", encoding="utf-8")
        changed_check = {**self.check, "modelSha256": "9" * 64}
        with (
            mock.patch.object(serve, "adapter_check", return_value=changed_check),
            mock.patch.object(serve, "prompt_sha256", return_value=self.hashes["prompt"]),
            mock.patch.object(serve, "require_approved_base_model_provenance"),
        ):
            health = serve.health(serve.API_KEY)
            self.assertEqual(health["status"], "incompatible")
            self.assertIs(health["productionReady"], False)
            self.assertIs(health["promotionVerified"], False)
            self.assertIn("promotion.adapter_model_hash_mismatch", health["adapterContractErrors"])
            request = serve.ExtractRequest(
                message="test",
                schemaVersion=CONTRACT.schema_version,
                contractVersion=CONTRACT.contract_version,
                contractHash=CONTRACT.semantic_sha256,
            )
            with self.assertRaises(HTTPException) as raised:
                serve.extract(request, serve.API_KEY)
            self.assertEqual(raised.exception.status_code, 503)

    def test_missing_registry_attestation_is_not_production_ready(self) -> None:
        serve.ACTIVE_MODEL_KEY = ""
        serve.EXPECTED_MODEL_SHA256 = ""
        with (
            mock.patch.object(serve, "adapter_check", return_value=self.check),
            mock.patch.object(serve, "prompt_sha256", return_value=self.hashes["prompt"]),
            mock.patch.object(serve, "require_approved_base_model_provenance"),
        ):
            health = serve.health(serve.API_KEY)
        self.assertEqual(health["status"], "incompatible")
        self.assertIs(health["promotionVerified"], False)
        self.assertIn("promotion.active_model_key_missing", health["adapterContractErrors"])

    def test_active_marker_change_invalidates_a_running_service(self) -> None:
        marker = json.loads(self.active_marker_path.read_text(encoding="utf-8"))
        marker["activeModelKey"] = "hatab-local-newly-promoted"
        self.active_marker_path.write_text(json.dumps(marker), encoding="utf-8")
        with (
            mock.patch.object(serve, "adapter_check", return_value=self.check),
            mock.patch.object(serve, "prompt_sha256", return_value=self.hashes["prompt"]),
            mock.patch.object(serve, "require_approved_base_model_provenance"),
        ):
            health = serve.health(serve.API_KEY)
        self.assertEqual(health["status"], "incompatible")
        self.assertIs(health["promotionVerified"], False)
        self.assertIn(
            "promotion.active_marker_activemodelkey_mismatch",
            health["adapterContractErrors"],
        )

    def test_unapproved_base_snapshot_cannot_report_ready(self) -> None:
        with (
            mock.patch.object(serve, "adapter_check", return_value=self.check),
            mock.patch.object(serve, "prompt_sha256", return_value=self.hashes["prompt"]),
            mock.patch.object(
                serve,
                "require_approved_base_model_provenance",
                side_effect=ValueError("not an approved snapshot"),
            ),
        ):
            health = serve.health(serve.API_KEY)
        self.assertEqual(health["status"], "incompatible")
        self.assertIs(health["promotionVerified"], False)
        self.assertIn(
            "promotion.base_model_snapshot_missing_or_invalid",
            health["adapterContractErrors"],
        )

    def test_health_rejects_missing_service_key(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            serve.health(None)
        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
