from __future__ import annotations

import hmac
import hashlib
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import torch
from fastapi import FastAPI, Header, HTTPException
from peft import PeftModel
from pydantic import BaseModel, ConfigDict, Field
from transformers import AutoModelForCausalLM, AutoTokenizer

from contract import (
    CONTRACT,
    MODEL_ENABLED_KINDS,
    ContractValidationError,
    contract_metadata,
    require_valid_envelope,
)
from model_readiness import adapter_check
from generation import generate_json_completion, generation_policy_metadata
from base_model_provenance import (
    cached_base_model_provenance,
    require_approved_base_model_provenance,
    require_pinned_base_model,
)
from prompt import MAX_CONTEXT_CHARACTERS, build_system_prompt, prompt_sha256


SERVICE_VERSION = "2.1.0"
ALLOWED_KINDS = MODEL_ENABLED_KINDS
BASE_MODEL = os.getenv("HATAB_LOCAL_AI_BASE_MODEL", "Qwen/Qwen3-0.6B")
BASE_MODEL_REVISION = os.getenv("HATAB_LOCAL_AI_BASE_MODEL_REVISION", "").strip()
ADAPTER_PATH = Path(os.getenv("HATAB_LOCAL_AI_ADAPTER", r"D:\hatab-local-ai\artifacts\qwen3-0.6b-hatab-lora-v2"))
ACTIVE_MODEL_KEY = os.getenv("HATAB_LOCAL_AI_ACTIVE_MODEL_KEY", "").strip()
ACTIVE_MARKER_PATH = Path(os.getenv("HATAB_LOCAL_AI_ACTIVE_MARKER_PATH", ""))
EXPECTED_IDENTITY_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_IDENTITY_SHA256", "").strip()
EXPECTED_BASE_ARTIFACT_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_BASE_ARTIFACT_SHA256", "").strip()
EXPECTED_MODEL_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_MODEL_SHA256", "").strip()
EXPECTED_CONFIG_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_CONFIG_SHA256", "").strip()
EXPECTED_MANIFEST_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_MANIFEST_SHA256", "").strip()
EXPECTED_EVALUATION_PATH = Path(os.getenv("HATAB_LOCAL_AI_EXPECTED_EVALUATION_PATH", ""))
EXPECTED_EVALUATION_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_EVALUATION_SHA256", "").strip()
EXPECTED_CONTRACT_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_CONTRACT_SHA256", "").strip()
EXPECTED_PROMPT_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_PROMPT_SHA256", "").strip()
EXPECTED_READINESS_SHA256 = os.getenv("HATAB_LOCAL_AI_EXPECTED_READINESS_SHA256", "").strip()
API_KEY = os.getenv("HATAB_LOCAL_AI_SECRET", "")
THREADS = int(os.getenv("HATAB_LOCAL_AI_THREADS", str(max(1, (os.cpu_count() or 4) - 1))))
SHA256_LENGTH = 64
REVISION_LENGTH = 40


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=8000)
    context: str | None = Field(default=None, max_length=MAX_CONTEXT_CHARACTERS)
    schemaVersion: str = Field(min_length=1, max_length=200)
    contractVersion: int = Field(ge=1)
    contractHash: str = Field(min_length=64, max_length=64)


class ModelRuntime:
    tokenizer: Any = None
    model: Any = None
    loaded_at: float | None = None
    base_model_snapshot: Path | None = None
    base_model_artifact_sha256: str | None = None
    base_model_files_sha256: dict[str, str] | None = None


runtime = ModelRuntime()


def _valid_sha256(value: str) -> bool:
    return len(value) == SHA256_LENGTH and all(character in "0123456789abcdef" for character in value)


def _valid_revision(value: str) -> bool:
    return len(value) == REVISION_LENGTH and all(character in "0123456789abcdef" for character in value)


def _base_model_provenance() -> tuple[Path, dict[str, str], str]:
    if not _valid_revision(BASE_MODEL_REVISION):
        raise ValueError("base model revision must be an exact lowercase commit SHA")
    require_pinned_base_model(BASE_MODEL, BASE_MODEL_REVISION)
    provenance = cached_base_model_provenance(BASE_MODEL, BASE_MODEL_REVISION)
    require_approved_base_model_provenance(provenance)
    return (
        Path(provenance["baseModelSnapshotPath"]),
        provenance["baseModelFilesSha256"],
        provenance["baseModelArtifactSha256"],
    )


def _read_json_object(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _read_hashed_json_object(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    """Read and hash one immutable byte snapshot, avoiding parse/hash TOCTOU drift."""
    if not path.is_file():
        return None, None
    try:
        content = path.read_bytes()
        value = json.loads(content.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None, None
    if not isinstance(value, dict):
        return None, None
    return value, hashlib.sha256(content).hexdigest()


def _same_path(left: Path | str, right: Path | str) -> bool:
    try:
        return Path(left).resolve(strict=True) == Path(right).resolve(strict=True)
    except (OSError, TypeError, ValueError):
        return False


def active_marker_attestation() -> list[str]:
    marker = _read_json_object(ACTIVE_MARKER_PATH)
    if marker is None or marker.get("schema") != "hatab-local-ai-active-model-v1":
        return ["promotion.active_marker_missing_or_invalid"]
    expected_values = {
        "activeModelKey": ACTIVE_MODEL_KEY,
        "modelIdentitySha256": EXPECTED_IDENTITY_SHA256,
        "baseModel": BASE_MODEL,
        "baseModelRevision": BASE_MODEL_REVISION,
        "baseModelArtifactSha256": EXPECTED_BASE_ARTIFACT_SHA256,
        "adapterModelSha256": EXPECTED_MODEL_SHA256,
        "adapterConfigSha256": EXPECTED_CONFIG_SHA256,
        "adapterManifestSha256": EXPECTED_MANIFEST_SHA256,
        "evaluationReportSha256": EXPECTED_EVALUATION_SHA256,
        "contractSha256": EXPECTED_CONTRACT_SHA256,
        "promptSha256": EXPECTED_PROMPT_SHA256,
    }
    errors = [
        f"promotion.active_marker_{field.lower()}_mismatch"
        for field, expected in expected_values.items()
        if marker.get(field) != expected
    ]
    if not _same_path(marker.get("adapter", ""), ADAPTER_PATH):
        errors.append("promotion.active_marker_adapter_path_mismatch")
    return errors


def base_model_attestation(check: dict[str, Any], *, refresh: bool = False) -> list[str]:
    errors: list[str] = []
    if not _valid_revision(BASE_MODEL_REVISION):
        errors.append("promotion.base_model_revision_missing_or_invalid")
    if not _valid_sha256(EXPECTED_BASE_ARTIFACT_SHA256):
        errors.append("promotion.expected_base_artifact_sha256_missing_or_invalid")
    try:
        if refresh or runtime.base_model_artifact_sha256 is None:
            snapshot, files, artifact_hash = _base_model_provenance()
            runtime.base_model_snapshot = snapshot
            runtime.base_model_files_sha256 = files
            runtime.base_model_artifact_sha256 = artifact_hash
        require_pinned_base_model(BASE_MODEL, BASE_MODEL_REVISION)
        require_approved_base_model_provenance({
            "baseModelRevision": BASE_MODEL_REVISION,
            "baseModelFilesSha256": runtime.base_model_files_sha256,
            "baseModelArtifactSha256": runtime.base_model_artifact_sha256,
        })
    except (OSError, ValueError):
        errors.append("promotion.base_model_snapshot_missing_or_invalid")
        return errors
    manifest = check.get("manifest")
    if not isinstance(manifest, dict):
        errors.append("promotion.base_model_manifest_missing")
        return errors
    if runtime.base_model_artifact_sha256 != EXPECTED_BASE_ARTIFACT_SHA256:
        errors.append("promotion.base_model_artifact_hash_mismatch")
    if manifest.get("baseModelRevision") != BASE_MODEL_REVISION:
        errors.append("promotion.base_model_revision_mismatch")
    if manifest.get("baseModelArtifactSha256") != runtime.base_model_artifact_sha256:
        errors.append("promotion.base_model_manifest_artifact_hash_mismatch")
    if manifest.get("baseModelFilesSha256") != runtime.base_model_files_sha256:
        errors.append("promotion.base_model_manifest_file_hashes_mismatch")
    return errors


def promotion_attestation(
    check: dict[str, Any], *, refresh_base: bool = False
) -> tuple[bool, list[str], str | None]:
    errors: list[str] = []
    expected_hashes = {
        "identity": EXPECTED_IDENTITY_SHA256,
        "base_artifact": EXPECTED_BASE_ARTIFACT_SHA256,
        "model": EXPECTED_MODEL_SHA256,
        "config": EXPECTED_CONFIG_SHA256,
        "manifest": EXPECTED_MANIFEST_SHA256,
        "evaluation": EXPECTED_EVALUATION_SHA256,
        "contract": EXPECTED_CONTRACT_SHA256,
        "prompt": EXPECTED_PROMPT_SHA256,
        "readiness": EXPECTED_READINESS_SHA256,
    }
    if not ACTIVE_MODEL_KEY:
        errors.append("promotion.active_model_key_missing")
    for label, value in expected_hashes.items():
        if not _valid_sha256(value):
            errors.append(f"promotion.expected_{label}_sha256_missing_or_invalid")
    if check.get("modelSha256") != EXPECTED_MODEL_SHA256:
        errors.append("promotion.adapter_model_hash_mismatch")
    if check.get("configSha256") != EXPECTED_CONFIG_SHA256:
        errors.append("promotion.adapter_config_hash_mismatch")
    if check.get("manifestSha256") != EXPECTED_MANIFEST_SHA256:
        errors.append("promotion.adapter_manifest_hash_mismatch")
    if check.get("baseModel") != BASE_MODEL:
        errors.append("promotion.base_model_mismatch")
    errors.extend(base_model_attestation(check, refresh=refresh_base))
    errors.extend(active_marker_attestation())
    if EXPECTED_CONTRACT_SHA256 != CONTRACT.semantic_sha256:
        errors.append("promotion.contract_hash_mismatch")
    current_prompt_hash = prompt_sha256()
    if EXPECTED_PROMPT_SHA256 != current_prompt_hash:
        errors.append("promotion.prompt_hash_mismatch")

    evaluation, evaluation_hash = _read_hashed_json_object(EXPECTED_EVALUATION_PATH)
    if evaluation is None:
        errors.append("promotion.evaluation_report_missing_or_invalid")
    else:
        if evaluation_hash != EXPECTED_EVALUATION_SHA256:
            errors.append("promotion.evaluation_report_hash_mismatch")
        if evaluation.get("schema") != "hatab-local-ai-golden-evaluation-v2":
            errors.append("promotion.evaluation_schema_mismatch")
        if evaluation.get("passed") is not True:
            errors.append("promotion.evaluation_not_passed")
        gates = evaluation.get("gates")
        if not isinstance(gates, dict) or not gates or any(value is not True for value in gates.values()):
            errors.append("promotion.evaluation_gate_failed")
        if not _same_path(evaluation.get("adapterPath", ""), ADAPTER_PATH):
            errors.append("promotion.evaluation_adapter_path_mismatch")
        if evaluation.get("baseModel") != BASE_MODEL:
            errors.append("promotion.evaluation_base_model_mismatch")
        if evaluation.get("adapterManifestSha256") != EXPECTED_MANIFEST_SHA256:
            errors.append("promotion.evaluation_manifest_hash_mismatch")
        if evaluation.get("contractSha256") != EXPECTED_CONTRACT_SHA256:
            errors.append("promotion.evaluation_contract_hash_mismatch")
        evaluation_prompt_hash = evaluation.get("runtimePromptSha256", evaluation.get("promptSha256"))
        if evaluation_prompt_hash != EXPECTED_PROMPT_SHA256:
            errors.append("promotion.evaluation_prompt_hash_mismatch")
    return not errors, errors, evaluation_hash


def adapter_manifest(
    *, refresh_base: bool = False
) -> tuple[dict[str, Any] | None, str, list[str], dict[str, Any], str | None]:
    check = adapter_check(ADAPTER_PATH)
    errors = list(check["blockers"])
    if check["baseModel"] is not None and check["baseModel"] != BASE_MODEL:
        errors.append("adapter.base_model_runtime_mismatch")
    promoted, promotion_errors, evaluation_hash = promotion_attestation(check, refresh_base=refresh_base)
    if not promoted:
        errors.extend(promotion_errors)
    status = "compatible" if check["ready"] else "incompatible"
    if errors:
        status = "incompatible"
    return check["manifest"], status, errors, check, evaluation_hash


def model_identity(check: dict[str, Any], evaluation_hash: str | None, promoted: bool) -> dict[str, Any]:
    return {
        "activeModelKey": ACTIVE_MODEL_KEY,
        "baseModel": BASE_MODEL,
        "baseModelRevision": BASE_MODEL_REVISION,
        "baseModelArtifactSha256": runtime.base_model_artifact_sha256,
        "modelIdentitySha256": EXPECTED_IDENTITY_SHA256,
        "adapter": str(ADAPTER_PATH.resolve()),
        "adapterModelSha256": check.get("modelSha256"),
        "adapterConfigSha256": check.get("configSha256"),
        "adapterManifestSha256": check.get("manifestSha256"),
        "evaluationReportSha256": evaluation_hash,
        "readinessSemanticSha256": EXPECTED_READINESS_SHA256,
        "promptSha256": prompt_sha256(),
        "promotionVerified": promoted,
    }


def require_key(value: str | None) -> None:
    if not API_KEY or value is None or not hmac.compare_digest(value, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid local AI key")


def require_request_contract(request: ExtractRequest) -> None:
    if (
        request.schemaVersion != CONTRACT.schema_version
        or request.contractVersion != CONTRACT.contract_version
        or request.contractHash != CONTRACT.semantic_sha256
    ):
        raise HTTPException(status_code=409, detail="Local AI operation contract mismatch")


def strict_result(text: str, *, source: str | None = None) -> dict[str, Any]:
    # Do not rescue JSON embedded in prose or Markdown fences: serving accepts
    # exactly one JSON envelope and nothing else.
    value = json.loads(text.strip())
    require_valid_envelope(value, allowed_kinds=ALLOWED_KINDS, source=source, require_nonempty=True)
    return {"actions": value["actions"], "unparsed": value["unparsed"]}


@asynccontextmanager
async def lifespan(_: FastAPI):
    torch.set_num_threads(THREADS)
    if len(API_KEY) < 32:
        raise RuntimeError("HATAB_LOCAL_AI_SECRET must contain at least 32 characters")
    if not ADAPTER_PATH.exists():
        raise RuntimeError(f"Adapter not found: {ADAPTER_PATH}")
    _, compatibility, compatibility_errors, _, _ = adapter_manifest(refresh_base=True)
    if compatibility != "compatible":
        raise RuntimeError("Adapter promotion attestation failed: " + ", ".join(compatibility_errors))
    if runtime.base_model_snapshot is None:
        raise RuntimeError("Pinned base-model snapshot was not resolved")
    runtime.tokenizer = AutoTokenizer.from_pretrained(
        runtime.base_model_snapshot,
        use_fast=True,
        local_files_only=True,
    )
    base = AutoModelForCausalLM.from_pretrained(
        runtime.base_model_snapshot,
        revision=BASE_MODEL_REVISION,
        local_files_only=True,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    runtime.model = PeftModel.from_pretrained(base, ADAPTER_PATH)
    runtime.model.eval()
    _, compatibility, compatibility_errors, _, _ = adapter_manifest(refresh_base=True)
    if compatibility != "compatible":
        runtime.model = None
        runtime.tokenizer = None
        raise RuntimeError(
            "Adapter promotion attestation changed while loading: " + ", ".join(compatibility_errors)
        )
    runtime.loaded_at = time.time()
    yield
    runtime.model = None
    runtime.tokenizer = None
    runtime.base_model_snapshot = None
    runtime.base_model_artifact_sha256 = None
    runtime.base_model_files_sha256 = None


app = FastAPI(title="HATAB Local ERP Intent Model", version=SERVICE_VERSION, lifespan=lifespan)


@app.get("/health")
def health(x_hatab_ai_key: str | None = Header(default=None)) -> dict[str, Any]:
    require_key(x_hatab_ai_key)
    manifest, compatibility, compatibility_errors, check, evaluation_hash = adapter_manifest()
    loaded = runtime.model is not None and runtime.tokenizer is not None
    promoted = loaded and compatibility == "compatible"
    status = "ready" if promoted else "incompatible" if compatibility != "compatible" else "loading"
    return {
        "status": status,
        "serviceVersion": SERVICE_VERSION,
        "adapterContractStatus": compatibility,
        "adapterContractErrors": compatibility_errors,
        "productionReady": promoted,
        "adapterManifest": manifest,
        "adapterRuntime": check["runtime"],
        "adapterSampling": check["sampling"],
        **model_identity(check, evaluation_hash, promoted),
        **contract_metadata(),
        # `contractSha256` is retained for model evidence; `contractHash` is the
        # application-wire name consumed by the Next.js boundary.
        "contractHash": CONTRACT.semantic_sha256,
        "activeModelKinds": sorted(ALLOWED_KINDS),
        "device": "cpu",
        "loadedAt": runtime.loaded_at,
        "generationPolicy": generation_policy_metadata(),
    }


@app.post("/extract")
def extract(request: ExtractRequest, x_hatab_ai_key: str | None = Header(default=None)) -> dict[str, Any]:
    require_key(x_hatab_ai_key)
    require_request_contract(request)
    _, compatibility, compatibility_errors, check, evaluation_hash = adapter_manifest()
    if compatibility != "compatible":
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ADAPTER_NOT_PRODUCTION_READY",
                "errors": compatibility_errors,
            },
        )
    if runtime.model is None or runtime.tokenizer is None:
        raise HTTPException(status_code=503, detail="Model is not ready")
    messages = [
        {"role": "system", "content": build_system_prompt(request.context)},
        {"role": "user", "content": request.message.strip()},
    ]
    prompt = runtime.tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
    )
    encoded = runtime.tokenizer(prompt, return_tensors="pt")
    generated = generate_json_completion(runtime.model, runtime.tokenizer, encoded)
    completion = generated.text
    try:
        result = strict_result(completion, source=request.message)
    except (ValueError, json.JSONDecodeError, ContractValidationError) as error:
        raise HTTPException(status_code=422, detail={
            "code": "MODEL_OUTPUT_INVALID",
            "message": str(error),
            "generation": generated.metadata(),
        }) from error
    return {
        **result,
        "model": BASE_MODEL,
        **model_identity(check, evaluation_hash, True),
        "schemaVersion": CONTRACT.schema_version,
        "contractVersion": CONTRACT.contract_version,
        "contractSha256": CONTRACT.semantic_sha256,
        "contractHash": CONTRACT.semantic_sha256,
        "latencyMs": generated.elapsed_ms,
        "generation": generated.metadata(),
    }
