from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any


PINNED_BASE_MODEL = "Qwen/Qwen3-0.6B"
PINNED_BASE_MODEL_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"
APPROVED_BASE_MODEL_ARTIFACT_SHA256 = "83b219f3770500a1c934947299c4b53491e3921be4e281c30f083147d9143fa5"
APPROVED_BASE_MODEL_KEY_FILES_SHA256 = {
    "config.json": "660db3b73d788119c04535e48cf9be5f55bc3100841a718637ae695b442f27dd",
    "model.safetensors": "f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b",
    "tokenizer.json": "aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4",
}
REVISION_PATTERN = re.compile(r"^[a-f0-9]{40}$")
MODEL_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_pinned_base_model(base_model: str, revision: str) -> None:
    if base_model != PINNED_BASE_MODEL:
        raise ValueError(f"Base model must be pinned to {PINNED_BASE_MODEL}")
    if revision != PINNED_BASE_MODEL_REVISION:
        raise ValueError(
            "Base model revision must be pinned to the approved commit "
            f"{PINNED_BASE_MODEL_REVISION}"
        )


def resolve_hf_home(configured: Path | str | None = None) -> Path:
    value = configured or os.getenv("HATAB_LOCAL_AI_HF_HOME") or os.getenv("HF_HOME")
    if value is None and os.name == "nt":
        value = r"D:\hatab-local-ai\hf-cache"
    if value is None or not str(value).strip():
        raise ValueError("HF_HOME is required for base-model provenance")
    return Path(str(value).strip()).expanduser().resolve()


def resolve_cached_snapshot(
    base_model: str,
    revision: str,
    *,
    hf_home: Path | str | None = None,
) -> Path:
    if not MODEL_ID_PATTERN.fullmatch(base_model):
        raise ValueError("Base model must be a canonical owner/repository id")
    if not REVISION_PATTERN.fullmatch(revision):
        raise ValueError("Base model revision must be an exact lowercase 40-character commit SHA")
    cache_root = resolve_hf_home(hf_home)
    snapshots_root = (
        cache_root
        / "hub"
        / f"models--{base_model.replace('/', '--')}"
        / "snapshots"
    ).resolve(strict=True)
    snapshot = (snapshots_root / revision).resolve(strict=True)
    try:
        snapshot.relative_to(snapshots_root)
    except ValueError as error:
        raise ValueError("Base-model revision snapshot is outside its cache root") from error
    if not snapshot.is_dir():
        raise ValueError("Base-model revision snapshot is not a directory")
    return snapshot


def snapshot_files_sha256(snapshot: Path) -> dict[str, str]:
    snapshot = snapshot.resolve(strict=True)
    entries: list[tuple[str, Path]] = []
    for candidate in snapshot.rglob("*"):
        relative = candidate.relative_to(snapshot).as_posix()
        if candidate.is_dir():
            continue
        if not candidate.is_file():
            raise ValueError(f"Unsupported base-model snapshot entry: {relative}")
        entries.append((relative, candidate))
    entries.sort(key=lambda entry: entry[0])
    if not entries:
        raise ValueError("Base-model snapshot contains no files")
    return {relative: sha256_file(path) for relative, path in entries}


def canonical_files_sha256(files_sha256: dict[str, str]) -> str:
    payload = json.dumps(
        files_sha256,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def valid_files_sha256(value: Any) -> bool:
    if not isinstance(value, dict) or not value:
        return False
    for relative, digest in value.items():
        if not isinstance(relative, str) or not relative or "\\" in relative:
            return False
        path = Path(relative)
        if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
            return False
        if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest):
            return False
    return list(value) == sorted(value)


def derive_base_model_provenance(
    snapshot: Path,
    *,
    base_model: str,
    revision: str,
) -> dict[str, Any]:
    if not MODEL_ID_PATTERN.fullmatch(base_model):
        raise ValueError("Base model must be a canonical owner/repository id")
    if not REVISION_PATTERN.fullmatch(revision):
        raise ValueError("Base model revision must be an exact lowercase 40-character commit SHA")
    snapshot = snapshot.resolve(strict=True)
    files_sha256 = snapshot_files_sha256(snapshot)
    return {
        "baseModelRevision": revision,
        "baseModelSnapshotPath": str(snapshot),
        "baseModelFilesSha256": files_sha256,
        "baseModelArtifactSha256": canonical_files_sha256(files_sha256),
    }


def require_approved_base_model_provenance(provenance: dict[str, Any]) -> None:
    if provenance.get("baseModelRevision") != PINNED_BASE_MODEL_REVISION:
        raise ValueError("Base-model provenance does not use the approved commit")
    files = provenance.get("baseModelFilesSha256")
    if not valid_files_sha256(files):
        raise ValueError("Base-model provenance file map is missing or noncanonical")
    if provenance.get("baseModelArtifactSha256") != canonical_files_sha256(files):
        raise ValueError("Base-model provenance aggregate does not match its file map")
    mismatched_files = [
        relative for relative, expected in APPROVED_BASE_MODEL_KEY_FILES_SHA256.items()
        if files.get(relative) != expected
    ]
    if mismatched_files:
        raise ValueError(
            "Base-model provenance key-file hash mismatch: " + ", ".join(mismatched_files)
        )
    if provenance.get("baseModelArtifactSha256") != APPROVED_BASE_MODEL_ARTIFACT_SHA256:
        raise ValueError("Base-model provenance aggregate hash does not match the approved snapshot")


def cached_base_model_provenance(
    base_model: str,
    revision: str,
    *,
    hf_home: Path | str | None = None,
) -> dict[str, Any]:
    snapshot = resolve_cached_snapshot(base_model, revision, hf_home=hf_home)
    return derive_base_model_provenance(snapshot, base_model=base_model, revision=revision)


def download_base_model_provenance(
    base_model: str,
    *,
    hf_home: Path | str | None = None,
) -> dict[str, Any]:
    cache_root = resolve_hf_home(hf_home)
    revision = PINNED_BASE_MODEL_REVISION
    require_pinned_base_model(base_model, revision)
    from huggingface_hub import snapshot_download

    downloaded = Path(snapshot_download(
        repo_id=base_model,
        revision=revision,
        cache_dir=str(cache_root / "hub"),
    )).resolve(strict=True)
    expected = resolve_cached_snapshot(base_model, revision, hf_home=cache_root)
    if downloaded != expected:
        raise ValueError("Downloaded base-model snapshot did not resolve to the pinned cache revision")
    provenance = derive_base_model_provenance(expected, base_model=base_model, revision=revision)
    require_approved_base_model_provenance(provenance)
    return provenance
