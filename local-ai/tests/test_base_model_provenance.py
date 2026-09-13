from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path


LOCAL_AI = Path(__file__).resolve().parents[1]
if str(LOCAL_AI) not in sys.path:
    sys.path.insert(0, str(LOCAL_AI))

from base_model_provenance import (  # noqa: E402
    PINNED_BASE_MODEL,
    PINNED_BASE_MODEL_REVISION,
    cached_base_model_provenance,
    canonical_files_sha256,
    derive_base_model_provenance,
    require_approved_base_model_provenance,
    require_pinned_base_model,
    valid_files_sha256,
)


class BaseModelProvenanceTests(unittest.TestCase):
    def test_snapshot_map_is_complete_sorted_and_canonically_hashed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            snapshot = Path(temporary)
            (snapshot / "nested").mkdir()
            (snapshot / "tokenizer.json").write_bytes(b"tokenizer")
            (snapshot / "config.json").write_bytes(b"config")
            (snapshot / "nested" / "model.safetensors").write_bytes(b"weights")

            result = derive_base_model_provenance(
                snapshot,
                base_model=PINNED_BASE_MODEL,
                revision=PINNED_BASE_MODEL_REVISION,
            )
            files = result["baseModelFilesSha256"]
            self.assertEqual(list(files), [
                "config.json",
                "nested/model.safetensors",
                "tokenizer.json",
            ])
            self.assertTrue(valid_files_sha256(files))
            expected_payload = json.dumps(
                files,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
            self.assertEqual(
                result["baseModelArtifactSha256"],
                hashlib.sha256(expected_payload).hexdigest(),
            )
            self.assertEqual(result["baseModelArtifactSha256"], canonical_files_sha256(files))

    def test_only_the_approved_model_commit_is_accepted_for_training(self) -> None:
        require_pinned_base_model(PINNED_BASE_MODEL, PINNED_BASE_MODEL_REVISION)
        with self.assertRaisesRegex(ValueError, "Base model must be pinned"):
            require_pinned_base_model("Qwen/Qwen3-1.7B", PINNED_BASE_MODEL_REVISION)
        with self.assertRaisesRegex(ValueError, "approved commit"):
            require_pinned_base_model(PINNED_BASE_MODEL, "0" * 40)

    def test_moved_main_ref_does_not_change_the_code_pinned_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            hf_home = Path(temporary)
            snapshot = (
                hf_home
                / "hub"
                / "models--Qwen--Qwen3-0.6B"
                / "snapshots"
                / PINNED_BASE_MODEL_REVISION
            )
            snapshot.mkdir(parents=True)
            (snapshot / "config.json").write_bytes(b"approved-pinned-snapshot")
            ref = hf_home / "hub" / "models--Qwen--Qwen3-0.6B" / "refs" / "main"
            ref.parent.mkdir(parents=True)
            ref.write_text("0" * 40, encoding="utf-8")
            result = cached_base_model_provenance(
                PINNED_BASE_MODEL,
                PINNED_BASE_MODEL_REVISION,
                hf_home=hf_home,
            )
            self.assertEqual(result["baseModelRevision"], PINNED_BASE_MODEL_REVISION)
            self.assertIn("config.json", result["baseModelFilesSha256"])

    def test_hash_map_validation_rejects_unsorted_or_noncanonical_entries(self) -> None:
        digest = "0" * 64
        self.assertFalse(valid_files_sha256({"z.json": digest, "a.json": digest}))
        self.assertFalse(valid_files_sha256({"../model.safetensors": digest}))
        self.assertFalse(valid_files_sha256({"model.safetensors": "A" * 64}))

    def test_code_pinned_hash_policy_rejects_a_self_consistent_but_unknown_snapshot(self) -> None:
        files = {
            "config.json": "1" * 64,
            "model.safetensors": "2" * 64,
            "tokenizer.json": "3" * 64,
        }
        with self.assertRaisesRegex(ValueError, "key-file hash mismatch"):
            require_approved_base_model_provenance({
                "baseModelRevision": PINNED_BASE_MODEL_REVISION,
                "baseModelFilesSha256": files,
                "baseModelArtifactSha256": canonical_files_sha256(files),
            })


if __name__ == "__main__":
    unittest.main()
