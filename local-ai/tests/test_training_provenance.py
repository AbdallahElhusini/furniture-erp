from __future__ import annotations

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
)
from contract import contract_metadata  # noqa: E402
from train_lora import prepare_output_directory, resume_manifest  # noqa: E402


class TrainingProvenanceTests(unittest.TestCase):
    def test_training_output_must_be_new_or_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            new_output = root / "new-adapter"
            prepare_output_directory(new_output)
            self.assertTrue(new_output.is_dir())

            prepare_output_directory(new_output)
            (new_output / "existing-manifest.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "use a new artifact path"):
                prepare_output_directory(new_output)

            file_output = root / "not-a-directory"
            file_output.write_text("occupied", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not a directory"):
                prepare_output_directory(file_output)

    def test_resume_requires_the_same_pinned_base_even_in_legacy_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            adapter = Path(temporary)
            files = {"config.json": "1" * 64, "model.safetensors": "2" * 64}
            artifact = "3" * 64
            prompt_hash = "4" * 64
            manifest = {
                "baseModel": PINNED_BASE_MODEL,
                "baseModelRevision": PINNED_BASE_MODEL_REVISION,
                "baseModelFilesSha256": files,
                "baseModelArtifactSha256": artifact,
                "promptSha256": prompt_hash,
                "datasetKinds": [],
                **contract_metadata(),
            }
            manifest_path = adapter / "hatab-training-manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            loaded, inherited = resume_manifest(
                adapter,
                expected_prompt_hash=prompt_hash,
                expected_base_model=PINNED_BASE_MODEL,
                expected_base_model_revision=PINNED_BASE_MODEL_REVISION,
                expected_base_model_files_sha256=files,
                expected_base_model_artifact_sha256=artifact,
                allow_legacy=False,
            )
            self.assertEqual(loaded, manifest)
            self.assertEqual(inherited, set())

            manifest["baseModelRevision"] = "0" * 40
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "approved pinned base snapshot"):
                resume_manifest(
                    adapter,
                    expected_prompt_hash=prompt_hash,
                    expected_base_model=PINNED_BASE_MODEL,
                    expected_base_model_revision=PINNED_BASE_MODEL_REVISION,
                    expected_base_model_files_sha256=files,
                    expected_base_model_artifact_sha256=artifact,
                    allow_legacy=True,
                )


if __name__ == "__main__":
    unittest.main()
