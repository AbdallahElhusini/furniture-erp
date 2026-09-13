import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const BASE_MODEL_REVISION_PATTERN = /^[a-f0-9]{40}$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const APPROVED_BASE_MODELS = Object.freeze({
  "Qwen/Qwen3-0.6B": Object.freeze({
    revision: "c1899de289a04d12100db370d81485cdf75e47ca",
    artifactSha256: "83b219f3770500a1c934947299c4b53491e3921be4e281c30f083147d9143fa5",
    requiredFilesSha256: Object.freeze({
      "config.json": "660db3b73d788119c04535e48cf9be5f55bc3100841a718637ae695b442f27dd",
      "model.safetensors": "f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b",
      "tokenizer.json": "aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4",
    }),
  }),
});

function sha256File(filePath) {
  const digest = createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("hex");
}

function comparablePath(value) {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function containedPath(candidate, parent) {
  const relative = path.relative(comparablePath(parent), comparablePath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function collectFiles(snapshotPath) {
  const entries = [];
  const walk = (directory, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (
      a.name.localeCompare(b.name, "en")
    ))) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) walk(absolute, relative);
      else if (stat.isFile()) entries.push([relative, sha256File(absolute), absolute]);
      else throw new Error(`Unsupported base-model snapshot entry: ${relative}`);
    }
  };
  walk(snapshotPath);
  if (entries.length === 0) throw new Error("Base-model snapshot contains no files");
  return entries;
}

export function resolveHfHome(configured) {
  const value = configured
    ?? process.env.HATAB_LOCAL_AI_HF_HOME
    ?? process.env.HF_HOME
    ?? (process.platform === "win32" ? "D:\\hatab-local-ai\\hf-cache" : "");
  if (!value || !String(value).trim()) throw new Error("HF_HOME is required for base-model provenance");
  return path.resolve(String(value).trim());
}

export function resolveCachedBaseModelRevision({ baseModel, hfHome }) {
  if (!MODEL_ID_PATTERN.test(baseModel)) throw new Error("Base model must be a canonical owner/repository id");
  const cacheRoot = resolveHfHome(hfHome);
  const referencePath = path.join(
    cacheRoot,
    "hub",
    `models--${baseModel.replace("/", "--")}`,
    "refs",
    "main",
  );
  const revision = fs.readFileSync(referencePath, "utf8").trim();
  if (!BASE_MODEL_REVISION_PATTERN.test(revision)) {
    throw new Error("Cached base-model main reference is not an exact commit SHA");
  }
  return revision;
}

export function deriveBaseModelProvenance({ baseModel, revision, hfHome }) {
  if (!MODEL_ID_PATTERN.test(baseModel)) throw new Error("Base model must be a canonical owner/repository id");
  if (!BASE_MODEL_REVISION_PATTERN.test(revision)) {
    throw new Error("Base model revision must be an exact lowercase 40-character commit SHA");
  }
  const cacheRoot = resolveHfHome(hfHome);
  const snapshotsRoot = fs.realpathSync.native(path.join(
    cacheRoot,
    "hub",
    `models--${baseModel.replace("/", "--")}`,
    "snapshots",
  ));
  const snapshotPath = fs.realpathSync.native(path.join(snapshotsRoot, revision));
  if (!fs.statSync(snapshotPath).isDirectory() || !containedPath(snapshotPath, snapshotsRoot)) {
    throw new Error("Base-model revision snapshot is invalid or outside its cache root");
  }
  const entries = collectFiles(snapshotPath);
  const filesSha256 = Object.fromEntries(
    entries
      .map(([relative, hash]) => [relative, hash])
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
  const artifactSha256 = createHash("sha256")
    .update(Buffer.from(JSON.stringify(filesSha256), "utf8"))
    .digest("hex");
  return {
    baseModelRevision: revision,
    baseModelSnapshotPath: snapshotPath,
    baseModelFilesSha256: filesSha256,
    baseModelArtifactSha256: artifactSha256,
    trackedFiles: entries.map(([relative, hash, filePath]) => ({ relative, hash, filePath })),
  };
}

export function assertApprovedBaseModelProvenance(
  { baseModel, provenance },
  approvedBaseModels = APPROVED_BASE_MODELS,
) {
  const approved = approvedBaseModels?.[baseModel];
  if (!approved || typeof approved !== "object") {
    throw new Error(`Base model is not approved for production: ${baseModel}`);
  }
  if (provenance.baseModelRevision !== approved.revision) {
    throw new Error("Base-model revision does not match the code-pinned production policy");
  }
  if (provenance.baseModelArtifactSha256 !== approved.artifactSha256) {
    throw new Error("Base-model aggregate does not match the code-pinned production policy");
  }
  for (const [relative, expectedHash] of Object.entries(approved.requiredFilesSha256 ?? {})) {
    if (provenance.baseModelFilesSha256[relative] !== expectedHash) {
      throw new Error(`Base-model file does not match production policy: ${relative}`);
    }
  }
  return approved;
}
