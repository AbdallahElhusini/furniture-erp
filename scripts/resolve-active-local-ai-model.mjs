import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import {
  BASE_MODEL_REVISION_PATTERN,
  assertApprovedBaseModelProvenance,
  deriveBaseModelProvenance,
  resolveHfHome,
} from "./local-ai-base-provenance.mjs";
import { loadProjectDatabaseUrl, resolveDatabasePath } from "./migrate-ai-operations.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const PROMOTION_EVIDENCE_SCHEMA = "hatab-local-ai-promotion-evidence-v2";
const TRAINING_MANIFEST_SCHEMA = "hatab-erp-intent-lora-v2";
const GOLDEN_EVALUATION_SCHEMA = "hatab-local-ai-golden-evaluation-v2";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_JSON_BYTES = 25 * 1024 * 1024;
const REQUIRED_COLUMNS = new Set([
  "key",
  "status",
  "isActive",
  "provider",
  "baseModel",
  "adapter",
  "runtime",
  "artifactPath",
  "artifactChecksum",
  "promptVersion",
  "toolSchemaVersion",
  "evaluationMetrics",
]);

export class ActiveModelResolutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ActiveModelResolutionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ActiveModelResolutionError(code, message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

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

function readJsonObject(filePath, label) {
  let bytes;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label} is not a regular file`);
    if (stat.size > MAX_JSON_BYTES) fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label} is too large`);
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    if (error instanceof ActiveModelResolutionError) throw error;
    fail("ACTIVE_MODEL_EVIDENCE_INVALID", `Could not read ${label}`);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label} is not valid JSON`);
  }
  if (!isRecord(value)) fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label} must be one JSON object`);
  return { value, sha256: sha256Bytes(bytes) };
}

function requireString(record, key, label) {
  const value = record?.[key];
  if (typeof value !== "string" || !value.trim()) {
    fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function requireSha(record, key, label) {
  const value = requireString(record, key, label);
  if (!SHA256_PATTERN.test(value)) {
    fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label}.${key} must be a lowercase SHA-256`);
  }
  return value;
}

function realFile(filePath, label) {
  try {
    const resolved = fs.realpathSync.native(filePath);
    if (!fs.statSync(resolved).isFile()) fail("ACTIVE_MODEL_ARTIFACT_INVALID", `${label} is not a file`);
    return resolved;
  } catch (error) {
    if (error instanceof ActiveModelResolutionError) throw error;
    fail("ACTIVE_MODEL_ARTIFACT_MISSING", `${label} is missing`);
  }
}

function realDirectory(directoryPath, label) {
  try {
    const resolved = fs.realpathSync.native(directoryPath);
    if (!fs.statSync(resolved).isDirectory()) {
      fail("ACTIVE_MODEL_ARTIFACT_INVALID", `${label} is not a directory`);
    }
    return resolved;
  } catch (error) {
    if (error instanceof ActiveModelResolutionError) throw error;
    fail("ACTIVE_MODEL_ARTIFACT_MISSING", `${label} is missing`);
  }
}

function comparablePath(value) {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function assertSamePath(actual, expected, label) {
  if (comparablePath(actual) !== comparablePath(expected)) {
    fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label} path mismatch`);
  }
}

function assertEqual(actual, expected, code, label) {
  if (actual !== expected) fail(code, `${label} mismatch`);
}

function resolvePythonExecutable() {
  const configured = process.env.HATAB_LOCAL_AI_PYTHON?.trim();
  if (configured) return configured;
  const managed = "D:\\hatab-local-ai\\.venv\\Scripts\\python.exe";
  if (process.platform === "win32" && fs.existsSync(managed)) return managed;
  return "python";
}

function currentPromptSha256(projectRoot, pythonExecutable) {
  const result = spawnSync(
    pythonExecutable,
    ["-c", "from prompt import prompt_sha256; print(prompt_sha256())"],
    {
      cwd: path.join(projectRoot, "local-ai"),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    fail("ACTIVE_MODEL_PROMPT_UNAVAILABLE", "Could not resolve the current local-AI prompt hash");
  }
  const value = result.stdout.trim();
  if (!SHA256_PATTERN.test(value)) {
    fail("ACTIVE_MODEL_PROMPT_UNAVAILABLE", "The current local-AI prompt hash is invalid");
  }
  return value;
}

function runtimeIdentity(runtime) {
  if (!isRecord(runtime)) fail("ACTIVE_MODEL_EVIDENCE_INVALID", "trainingManifest.runtime is missing");
  return [
    `python@${requireString(runtime, "pythonVersion", "trainingManifest.runtime")}`,
    `torch@${requireString(runtime, "torchVersion", "trainingManifest.runtime")}`,
    `transformers@${requireString(runtime, "transformersVersion", "trainingManifest.runtime")}`,
    `peft@${requireString(runtime, "peftVersion", "trainingManifest.runtime")}`,
  ].join(";");
}

function requirePassingGates(gates, label) {
  if (!isRecord(gates) || Object.keys(gates).length === 0) {
    fail("ACTIVE_MODEL_EVIDENCE_INVALID", `${label} is missing`);
  }
  if (Object.values(gates).some((value) => value !== true)) {
    fail("ACTIVE_MODEL_NOT_PRODUCTION_READY", `${label} contains a failed gate`);
  }
}

function assertRegistryShape(database) {
  const table = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'AiModelVersion'",
  ).get();
  if (!table) fail("MODEL_REGISTRY_MISSING", "AiModelVersion is missing; run the AI storage migration");
  const columns = new Set(
    database.prepare('PRAGMA table_info("AiModelVersion")').all().map((column) => column.name),
  );
  const missing = [...REQUIRED_COLUMNS].filter((column) => !columns.has(column));
  if (missing.length > 0) {
    fail("MODEL_REGISTRY_INCOMPATIBLE", `AiModelVersion is missing: ${missing.join(", ")}`);
  }
}

export function resolveActiveLocalAiModel(databasePath, options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT);
  const pythonExecutable = options.pythonExecutable ?? resolvePythonExecutable();
  const hfHome = resolveHfHome(options.hfHome);
  let registryPath;
  try {
    registryPath = fs.realpathSync.native(path.resolve(databasePath));
    if (!fs.statSync(registryPath).isFile()) fail("MODEL_REGISTRY_MISSING", "Model registry is not a file");
  } catch (error) {
    if (error instanceof ActiveModelResolutionError) throw error;
    fail("MODEL_REGISTRY_MISSING", "Model registry is missing");
  }
  const database = new Database(registryPath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    database.pragma("busy_timeout = 10000");
    assertRegistryShape(database);
    const rows = database.prepare(
      `SELECT "key", "status", "isActive", "provider", "baseModel", "adapter", "runtime",
              "artifactPath", "artifactChecksum", "promptVersion", "toolSchemaVersion",
              "evaluationMetrics"
       FROM "AiModelVersion" WHERE "isActive" = 1 ORDER BY "id"`,
    ).all();
    if (rows.length !== 1) {
      fail(
        rows.length === 0 ? "ACTIVE_MODEL_MISSING" : "MULTIPLE_ACTIVE_MODELS",
        rows.length === 0
          ? "No production-ready local AI model is active"
          : "More than one local AI model is marked active",
      );
    }
    const row = rows[0];
    if (row.status !== "ACTIVE") fail("ACTIVE_MODEL_STATE_INVALID", "Active model status must be ACTIVE");
    if (row.provider !== "LOCAL") fail("ACTIVE_MODEL_PROVIDER_INVALID", "Active model provider must be LOCAL");
    const artifactPath = realDirectory(row.artifactPath, "active model artifact directory");
    const modelPath = realFile(path.join(artifactPath, "adapter_model.safetensors"), "adapter model");
    const configPath = realFile(path.join(artifactPath, "adapter_config.json"), "adapter config");
    const manifestPath = realFile(path.join(artifactPath, "hatab-training-manifest.json"), "training manifest");
    const modelHash = sha256File(modelPath);
    const configHash = sha256File(configPath);
    const manifestDocument = readJsonObject(manifestPath, "training manifest");
    const manifest = manifestDocument.value;

    let evidence;
    try {
      evidence = JSON.parse(row.evaluationMetrics);
    } catch {
      fail("ACTIVE_MODEL_EVIDENCE_INVALID", "Active model evidence is invalid JSON");
    }
    if (!isRecord(evidence) || evidence.schema !== PROMOTION_EVIDENCE_SCHEMA) {
      fail("ACTIVE_MODEL_EVIDENCE_INVALID", "Active model is missing v2 promotion evidence");
    }
    requirePassingGates(evidence.goldenGates, "promotionEvidence.goldenGates");
    requireSha(evidence, "readinessSemanticSha256", "promotionEvidence");
    assertSamePath(requireString(evidence, "adapterPath", "promotionEvidence"), artifactPath, "promotionEvidence.adapterPath");
    assertSamePath(requireString(evidence, "trainingManifestPath", "promotionEvidence"), manifestPath, "promotionEvidence.trainingManifestPath");
    assertSamePath(requireString(evidence, "adapterConfigPath", "promotionEvidence"), configPath, "promotionEvidence.adapterConfigPath");
    const evaluationPath = realFile(
      requireString(evidence, "evaluationReportPath", "promotionEvidence"),
      "golden evaluation report",
    );
    const evaluationDocument = readJsonObject(evaluationPath, "golden evaluation report");
    const evaluation = evaluationDocument.value;

    assertEqual(modelHash, row.artifactChecksum, "ACTIVE_MODEL_ARTIFACT_TAMPERED", "registry adapter checksum");
    assertEqual(modelHash, requireSha(evidence, "adapterModelSha256", "promotionEvidence"), "ACTIVE_MODEL_ARTIFACT_TAMPERED", "promoted adapter checksum");
    assertEqual(configHash, requireSha(evidence, "adapterConfigSha256", "promotionEvidence"), "ACTIVE_MODEL_ARTIFACT_TAMPERED", "adapter config checksum");
    assertEqual(manifestDocument.sha256, requireSha(evidence, "trainingManifestSha256", "promotionEvidence"), "ACTIVE_MODEL_ARTIFACT_TAMPERED", "training manifest checksum");
    assertEqual(evaluationDocument.sha256, requireSha(evidence, "evaluationReportSha256", "promotionEvidence"), "ACTIVE_MODEL_ARTIFACT_TAMPERED", "golden evaluation checksum");

    if (manifest.schema !== TRAINING_MANIFEST_SCHEMA) {
      fail("ACTIVE_MODEL_EVIDENCE_INVALID", "Training manifest schema mismatch");
    }
    assertSamePath(requireString(manifest, "adapterPath", "trainingManifest"), artifactPath, "trainingManifest.adapterPath");
    assertEqual(requireSha(manifest, "adapterModelSha256", "trainingManifest"), modelHash, "ACTIVE_MODEL_ARTIFACT_TAMPERED", "training manifest model checksum");
    assertEqual(requireSha(manifest, "adapterConfigSha256", "trainingManifest"), configHash, "ACTIVE_MODEL_ARTIFACT_TAMPERED", "training manifest config checksum");

    if (evaluation.schema !== GOLDEN_EVALUATION_SCHEMA || evaluation.passed !== true) {
      fail("ACTIVE_MODEL_NOT_PRODUCTION_READY", "Golden evaluation report did not pass the v2 gate");
    }
    requirePassingGates(evaluation.gates, "goldenEvaluation.gates");
    if (stableStringify(evidence.goldenGates) !== stableStringify(evaluation.gates)) {
      fail("ACTIVE_MODEL_EVIDENCE_INVALID", "Golden gates differ from promoted evidence");
    }
    assertSamePath(requireString(evaluation, "adapterPath", "goldenEvaluation"), artifactPath, "goldenEvaluation.adapterPath");
    assertEqual(requireSha(evaluation, "adapterManifestSha256", "goldenEvaluation"), manifestDocument.sha256, "ACTIVE_MODEL_EVIDENCE_INVALID", "golden evaluation manifest checksum");

    const contractPath = realFile(
      path.join(projectRoot, "contracts", "admin-assistant-operations.v2.json"),
      "operation contract",
    );
    const contractDocument = readJsonObject(contractPath, "operation contract");
    const contractHash = sha256Bytes(Buffer.from(stableStringify(contractDocument.value), "utf8"));
    const contractFileHash = contractDocument.sha256;
    const promptHash = currentPromptSha256(projectRoot, pythonExecutable);
    const evaluationPromptHash = typeof evaluation.runtimePromptSha256 === "string"
      ? requireSha(evaluation, "runtimePromptSha256", "goldenEvaluation")
      : requireSha(evaluation, "promptSha256", "goldenEvaluation");
    const schemaVersion = contractDocument.value.schemaVersion;
    const contractVersion = contractDocument.value.contractVersion;
    if (typeof schemaVersion !== "string" || !schemaVersion || !Number.isInteger(contractVersion)) {
      fail("ACTIVE_MODEL_EVIDENCE_INVALID", "Current operation contract version metadata is invalid");
    }
    for (const [actual, expected, label] of [
      [requireSha(evidence, "contractSha256", "promotionEvidence"), contractHash, "promotion evidence contract"],
      [requireSha(evidence, "contractFileSha256", "promotionEvidence"), contractFileHash, "promotion evidence contract file"],
      [requireSha(evidence, "promptSha256", "promotionEvidence"), promptHash, "promotion evidence prompt"],
      [requireSha(manifest, "contractSha256", "trainingManifest"), contractHash, "training manifest contract"],
      [requireSha(manifest, "contractFileSha256", "trainingManifest"), contractFileHash, "training manifest contract file"],
      [requireSha(manifest, "promptSha256", "trainingManifest"), promptHash, "training manifest prompt"],
      [requireSha(evaluation, "contractSha256", "goldenEvaluation"), contractHash, "golden evaluation contract"],
      [evaluationPromptHash, promptHash, "golden evaluation prompt"],
    ]) {
      assertEqual(actual, expected, "ACTIVE_MODEL_CONTRACT_DRIFT", label);
    }
    assertEqual(evidence.schemaVersion, schemaVersion, "ACTIVE_MODEL_CONTRACT_DRIFT", "promotion evidence schema version");
    assertEqual(evidence.contractVersion, contractVersion, "ACTIVE_MODEL_CONTRACT_DRIFT", "promotion evidence contract version");
    assertEqual(manifest.schemaVersion, schemaVersion, "ACTIVE_MODEL_CONTRACT_DRIFT", "training manifest schema version");
    assertEqual(manifest.contractVersion, contractVersion, "ACTIVE_MODEL_CONTRACT_DRIFT", "training manifest contract version");

    const baseModel = requireString(manifest, "baseModel", "trainingManifest");
    const baseModelRevision = requireString(manifest, "baseModelRevision", "trainingManifest");
    if (!BASE_MODEL_REVISION_PATTERN.test(baseModelRevision)) {
      fail("ACTIVE_MODEL_BASE_PROVENANCE_INVALID", "Base model is not pinned to an exact commit");
    }
    let baseProvenance;
    try {
      baseProvenance = deriveBaseModelProvenance({
        baseModel,
        revision: baseModelRevision,
        hfHome,
      });
      assertApprovedBaseModelProvenance(
        { baseModel, provenance: baseProvenance },
        options.approvedBaseModels,
      );
    } catch {
      fail("ACTIVE_MODEL_BASE_PROVENANCE_INVALID", "Pinned base-model snapshot could not be verified");
    }
    if (
      !isRecord(manifest.baseModelFilesSha256)
      || stableStringify(manifest.baseModelFilesSha256) !== stableStringify(baseProvenance.baseModelFilesSha256)
      || requireSha(manifest, "baseModelArtifactSha256", "trainingManifest") !== baseProvenance.baseModelArtifactSha256
      || evidence.baseModelRevision !== baseModelRevision
      || !isRecord(evidence.baseModelFilesSha256)
      || stableStringify(evidence.baseModelFilesSha256) !== stableStringify(baseProvenance.baseModelFilesSha256)
      || requireSha(evidence, "baseModelArtifactSha256", "promotionEvidence") !== baseProvenance.baseModelArtifactSha256
    ) {
      fail("ACTIVE_MODEL_BASE_PROVENANCE_INVALID", "Base-model artifact identity mismatch");
    }
    assertSamePath(
      requireString(evidence, "baseModelSnapshotPath", "promotionEvidence"),
      baseProvenance.baseModelSnapshotPath,
      "promotionEvidence.baseModelSnapshotPath",
    );
    assertEqual(evaluation.baseModel, baseModel, "ACTIVE_MODEL_EVIDENCE_INVALID", "golden evaluation base model");
    assertEqual(row.baseModel, baseModel, "ACTIVE_MODEL_REGISTRY_MISMATCH", "registry base model");
    assertEqual(row.adapter, manifest.schema, "ACTIVE_MODEL_REGISTRY_MISMATCH", "registry adapter schema");
    assertEqual(row.runtime, runtimeIdentity(manifest.runtime), "ACTIVE_MODEL_REGISTRY_MISMATCH", "registry runtime");
    assertEqual(row.promptVersion, `sha256:${promptHash}`, "ACTIVE_MODEL_REGISTRY_MISMATCH", "registry prompt version");
    assertEqual(
      row.toolSchemaVersion,
      `${schemaVersion}@${contractVersion}:${contractHash}`,
      "ACTIVE_MODEL_REGISTRY_MISMATCH",
      "registry tool schema version",
    );

    const identity = {
      baseModel,
      baseModelRevision,
      baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
      adapterModelSha256: modelHash,
      adapterConfigSha256: configHash,
      adapterPath: artifactPath,
      trainingManifestPath: manifestPath,
      adapterConfigPath: configPath,
      evaluationReportPath: evaluationPath,
      trainingManifestSha256: manifestDocument.sha256,
      evaluationReportSha256: evaluationDocument.sha256,
      contractSha256: contractHash,
      promptSha256: promptHash,
    };
    const identityHash = sha256Bytes(Buffer.from(stableStringify(identity), "utf8"));
    assertEqual(requireSha(evidence, "identityHash", "promotionEvidence"), identityHash, "ACTIVE_MODEL_IDENTITY_MISMATCH", "promotion identity");
    assertEqual(row.key, `hatab-local-${identityHash.slice(0, 24)}`, "ACTIVE_MODEL_IDENTITY_MISMATCH", "registry model key");

    return {
      key: row.key,
      identityHash,
      baseModel,
      baseModelRevision,
      baseModelSnapshotPath: baseProvenance.baseModelSnapshotPath,
      baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
      artifactPath,
      artifactChecksum: modelHash,
      adapterModelSha256: modelHash,
      adapterConfigSha256: configHash,
      adapterManifestSha256: manifestDocument.sha256,
      evaluationReportPath: evaluationPath,
      evaluationReportSha256: evaluationDocument.sha256,
      readinessSemanticSha256: requireSha(evidence, "readinessSemanticSha256", "promotionEvidence"),
      contractSha256: contractHash,
      promptSha256: promptHash,
    };
  } finally {
    database.close();
  }
}

function parseArguments(argv) {
  const parsed = { databaseUrl: null, hfHome: null, pathOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--path-only") parsed.pathOnly = true;
    else if (argv[index] === "--database-url") {
      parsed.databaseUrl = argv[++index];
      if (!parsed.databaseUrl) fail("ARGUMENT_INVALID", "--database-url requires a file: URL");
    } else if (argv[index] === "--hf-home") {
      parsed.hfHome = argv[++index];
      if (!parsed.hfHome) fail("ARGUMENT_INVALID", "--hf-home requires a directory path");
    } else fail("ARGUMENT_INVALID", `Unknown argument: ${argv[index]}`);
  }
  return parsed;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const databaseUrl = args.databaseUrl ?? loadProjectDatabaseUrl(PROJECT_ROOT);
  const result = resolveActiveLocalAiModel(resolveDatabasePath(databaseUrl, PROJECT_ROOT), {
    hfHome: args.hfHome,
  });
  process.stdout.write(args.pathOnly ? `${result.artifactPath}\n` : `${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    main();
  } catch (error) {
    const payload = error instanceof ActiveModelResolutionError
      ? { error: error.code, message: error.message }
      : {
          error: "ACTIVE_MODEL_RESOLUTION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
  }
}
