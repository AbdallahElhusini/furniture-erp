import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import {
  loadProjectDatabaseUrl,
  resolveDatabasePath,
} from "./migrate-ai-operations.mjs";
import {
  BASE_MODEL_REVISION_PATTERN,
  assertApprovedBaseModelProvenance,
  deriveBaseModelProvenance,
  resolveHfHome,
} from "./local-ai-base-provenance.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const READINESS_SCHEMA = "hatab-local-ai-model-readiness-v2";
const PROMOTION_EVIDENCE_SCHEMA = "hatab-local-ai-promotion-evidence-v2";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_JSON_BYTES = 25 * 1024 * 1024;
const REQUIRED_MODEL_COLUMNS = new Set([
  "id",
  "key",
  "displayName",
  "provider",
  "baseModel",
  "adapter",
  "quantization",
  "runtime",
  "artifactPath",
  "artifactChecksum",
  "promptVersion",
  "toolSchemaVersion",
  "evaluationMetrics",
  "status",
  "isActive",
  "activatedAt",
  "retiredAt",
  "createdAt",
  "updatedAt",
]);

export class ModelPromotionError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "ModelPromotionError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = []) {
  throw new ModelPromotionError(code, message, details);
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
  const hash = createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function readJsonObject(filePath, label) {
  let bytes;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) fail("EVIDENCE_NOT_FILE", `${label} is not a regular file: ${filePath}`);
    if (stat.size > MAX_JSON_BYTES) fail("EVIDENCE_TOO_LARGE", `${label} exceeds ${MAX_JSON_BYTES} bytes`);
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    if (error instanceof ModelPromotionError) throw error;
    fail("EVIDENCE_READ_FAILED", `Could not read ${label}: ${filePath}`, [String(error)]);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail("EVIDENCE_INVALID_JSON", `${label} is not valid JSON: ${filePath}`, [String(error)]);
  }
  if (!isRecord(value)) fail("EVIDENCE_INVALID_SHAPE", `${label} must contain one JSON object`);
  return { value, bytes, sha256: sha256Bytes(bytes) };
}

function requireString(record, key, label) {
  const value = record?.[key];
  if (typeof value !== "string" || !value.trim()) {
    fail("EVIDENCE_FIELD_INVALID", `${label}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function requireSha(record, key, label) {
  const value = requireString(record, key, label);
  if (!SHA256_PATTERN.test(value)) fail("EVIDENCE_HASH_INVALID", `${label}.${key} must be a lowercase SHA-256`);
  return value;
}

function requireReadyReport(report, label) {
  if (report.schema !== READINESS_SCHEMA) {
    fail("READINESS_SCHEMA_MISMATCH", `${label}.schema must equal ${READINESS_SCHEMA}`);
  }
  const blockers = report.blockers;
  if (report.productionReady !== true || !Array.isArray(blockers) || blockers.length !== 0) {
    fail(
      "READINESS_GATE_FAILED",
      `${label} is not production-ready`,
      Array.isArray(blockers) ? blockers.map(String) : ["blockers.missing_or_invalid"],
    );
  }
  for (const [field, value] of [
    ["dataset.valid", report.dataset?.valid],
    ["golden.valid", report.golden?.valid],
    ["contractCases.valid", report.contractCases?.valid],
    ["adapter.ready", report.adapter?.ready],
    ["evaluation.ready", report.evaluation?.ready],
    ["evaluation.report.passed", report.evaluation?.report?.passed],
  ]) {
    if (value !== true) fail("READINESS_GATE_FAILED", `${label}.${field} must be true`);
  }
}

function verifyReadinessSemanticHash(report, label) {
  // Python owns the cross-language canonicalization (notably float formatting).
  // The freshly regenerated report is the authority; Node compares its hash to
  // the supplied report and independently verifies every promoted file below.
  return requireSha(report, "readinessSha256", label);
}

function comparablePath(value) {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function assertSamePath(actual, expected, label) {
  if (comparablePath(actual) !== comparablePath(expected)) {
    fail("EVIDENCE_PATH_MISMATCH", `${label} does not match the candidate adapter directory`);
  }
}

function assertEqual(actual, expected, code, label) {
  if (actual !== expected) fail(code, `${label} mismatch`);
}

function assertSameJson(actual, expected, label) {
  if (stableStringify(actual) !== stableStringify(expected)) {
    fail("EVIDENCE_SNAPSHOT_MISMATCH", `${label} differs from the readiness snapshot`);
  }
}

function resolvePythonExecutable() {
  const configured = process.env.HATAB_LOCAL_AI_PYTHON?.trim();
  if (configured) return configured;
  const managed = "D:\\hatab-local-ai\\.venv\\Scripts\\python.exe";
  if (process.platform === "win32" && fs.existsSync(managed)) return managed;
  return "python";
}

function regenerateReadiness(candidateReport, projectRoot, pythonExecutable, readinessScriptOverride) {
  const adapter = candidateReport.adapter;
  const evaluation = candidateReport.evaluation;
  if (!isRecord(adapter) || !isRecord(evaluation)) {
    fail("EVIDENCE_FIELD_INVALID", "Readiness report must contain adapter and evaluation objects");
  }
  const adapterPath = requireString(adapter, "path", "readiness.adapter");
  const evaluationPath = requireString(evaluation, "path", "readiness.evaluation");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-model-readiness-"));
  const outputPath = path.join(temporaryDirectory, "fresh-readiness.json");
  try {
    const readinessScript = readinessScriptOverride
      ? path.resolve(readinessScriptOverride)
      : path.join(projectRoot, "local-ai", "model_readiness.py");
    const result = spawnSync(pythonExecutable, [
      readinessScript,
      "--adapter",
      adapterPath,
      "--evaluation-report",
      evaluationPath,
      "--output",
      outputPath,
      "--require-ready",
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: MAX_JSON_BYTES,
    });
    if (result.error) {
      fail("READINESS_REGENERATION_FAILED", "Could not run the Python readiness gate", [result.error.message]);
    }
    if (result.status !== 0) {
      let blockers = [];
      if (fs.existsSync(outputPath)) {
        try {
          const failedReport = readJsonObject(outputPath, "fresh readiness report").value;
          blockers = Array.isArray(failedReport.blockers) ? failedReport.blockers.map(String) : [];
        } catch {
          // Preserve the primary readiness failure below.
        }
      }
      fail("READINESS_REGENERATION_FAILED", "The fresh Python readiness gate refused this candidate", blockers);
    }
    return readJsonObject(outputPath, "fresh readiness report");
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

function verifyEvidence(
  candidateReadiness,
  freshReadiness,
  readinessFile,
  projectRoot,
  hfHome,
  approvedBaseModels,
) {
  requireReadyReport(candidateReadiness.value, "readiness");
  requireReadyReport(freshReadiness.value, "freshReadiness");
  const candidate = candidateReadiness.value;
  const fresh = freshReadiness.value;
  const candidateReadinessHash = verifyReadinessSemanticHash(candidate, "readiness");
  const freshReadinessHash = verifyReadinessSemanticHash(fresh, "freshReadiness");
  assertEqual(candidateReadinessHash, freshReadinessHash, "STALE_READINESS_REPORT", "readiness.readinessSha256");

  for (const key of [
    "schemaVersion",
    "contractVersion",
    "contractSha256",
    "contractFileSha256",
    "promptSha256",
  ]) {
    assertEqual(candidate[key], fresh[key], "STALE_READINESS_REPORT", `readiness.${key}`);
  }
  assertEqual(
    candidate.dataset?.validationSha256,
    fresh.dataset?.validationSha256,
    "STALE_READINESS_REPORT",
    "readiness.dataset.validationSha256",
  );

  const contractPath = path.join(projectRoot, "contracts", "admin-assistant-operations.v2.json");
  const contractDocument = readJsonObject(contractPath, "operation contract");
  const semanticContractHash = sha256Bytes(Buffer.from(stableStringify(contractDocument.value), "utf8"));
  assertEqual(requireSha(fresh, "contractSha256", "freshReadiness"), semanticContractHash, "CONTRACT_HASH_MISMATCH", "contract semantic SHA-256");
  assertEqual(requireSha(fresh, "contractFileSha256", "freshReadiness"), contractDocument.sha256, "CONTRACT_HASH_MISMATCH", "contract file SHA-256");
  assertEqual(fresh.schemaVersion, contractDocument.value.schemaVersion, "CONTRACT_VERSION_MISMATCH", "contract schemaVersion");
  assertEqual(fresh.contractVersion, contractDocument.value.contractVersion, "CONTRACT_VERSION_MISMATCH", "contract contractVersion");
  const promptHash = requireSha(fresh, "promptSha256", "freshReadiness");

  const adapterReport = fresh.adapter;
  const candidateAdapterReport = candidate.adapter;
  const evaluationReport = fresh.evaluation;
  const candidateEvaluationReport = candidate.evaluation;
  if (![adapterReport, candidateAdapterReport, evaluationReport, candidateEvaluationReport].every(isRecord)) {
    fail("EVIDENCE_FIELD_INVALID", "Readiness adapter/evaluation evidence is incomplete");
  }

  const adapterPath = fs.realpathSync.native(requireString(adapterReport, "path", "freshReadiness.adapter"));
  if (!fs.statSync(adapterPath).isDirectory()) fail("ADAPTER_PATH_INVALID", "Candidate adapter path must be a directory");
  assertSamePath(candidateAdapterReport.path, adapterPath, "readiness.adapter.path");
  const manifestPath = fs.realpathSync.native(path.join(adapterPath, "hatab-training-manifest.json"));
  const modelPath = fs.realpathSync.native(path.join(adapterPath, "adapter_model.safetensors"));
  const configPath = fs.realpathSync.native(path.join(adapterPath, "adapter_config.json"));
  assertSamePath(adapterReport.manifestPath, manifestPath, "freshReadiness.adapter.manifestPath");
  assertSamePath(adapterReport.modelPath, modelPath, "freshReadiness.adapter.modelPath");
  assertSamePath(adapterReport.configPath, configPath, "freshReadiness.adapter.configPath");

  const manifestDocument = readJsonObject(manifestPath, "training manifest");
  const manifest = manifestDocument.value;
  assertEqual(requireSha(adapterReport, "manifestSha256", "freshReadiness.adapter"), manifestDocument.sha256, "ARTIFACT_HASH_MISMATCH", "fresh readiness manifest SHA-256");
  assertEqual(requireSha(candidateAdapterReport, "manifestSha256", "readiness.adapter"), manifestDocument.sha256, "ARTIFACT_HASH_MISMATCH", "candidate readiness manifest SHA-256");
  assertSameJson(adapterReport.manifest, manifest, "fresh readiness adapter manifest");
  assertSameJson(candidateAdapterReport.manifest, manifest, "candidate readiness adapter manifest");
  assertSamePath(requireString(manifest, "adapterPath", "trainingManifest"), adapterPath, "trainingManifest.adapterPath");
  const modelHash = sha256File(modelPath);
  const configHash = sha256File(configPath);
  assertEqual(requireSha(adapterReport, "modelSha256", "freshReadiness.adapter"), modelHash, "ARTIFACT_HASH_MISMATCH", "fresh readiness model SHA-256");
  assertEqual(requireSha(adapterReport, "configSha256", "freshReadiness.adapter"), configHash, "ARTIFACT_HASH_MISMATCH", "fresh readiness config SHA-256");
  assertEqual(requireSha(manifest, "adapterModelSha256", "trainingManifest"), modelHash, "ARTIFACT_HASH_MISMATCH", "adapter model SHA-256");
  assertEqual(requireSha(manifest, "adapterConfigSha256", "trainingManifest"), configHash, "ARTIFACT_HASH_MISMATCH", "adapter config SHA-256");
  assertEqual(requireSha(manifest, "contractSha256", "trainingManifest"), semanticContractHash, "CONTRACT_HASH_MISMATCH", "training manifest contract SHA-256");
  assertEqual(requireSha(manifest, "contractFileSha256", "trainingManifest"), contractDocument.sha256, "CONTRACT_HASH_MISMATCH", "training manifest contract file SHA-256");
  assertEqual(requireSha(manifest, "promptSha256", "trainingManifest"), promptHash, "PROMPT_HASH_MISMATCH", "training manifest prompt SHA-256");
  assertEqual(manifest.schemaVersion, fresh.schemaVersion, "CONTRACT_VERSION_MISMATCH", "training manifest schemaVersion");
  assertEqual(manifest.contractVersion, fresh.contractVersion, "CONTRACT_VERSION_MISMATCH", "training manifest contractVersion");

  const enabledKinds = Array.isArray(fresh.modelEnabledKinds) ? fresh.modelEnabledKinds.map(String).sort() : null;
  const trainedKinds = Array.isArray(manifest.modelEnabledKindsAtTraining)
    ? manifest.modelEnabledKindsAtTraining.map(String).sort()
    : null;
  if (!enabledKinds || !trainedKinds || stableStringify(enabledKinds) !== stableStringify(trainedKinds)) {
    fail("MODEL_KIND_COVERAGE_MISMATCH", "Training manifest modelEnabledKindsAtTraining does not match the current contract");
  }

  const evaluationPath = fs.realpathSync.native(requireString(evaluationReport, "path", "freshReadiness.evaluation"));
  assertSamePath(candidateEvaluationReport.path, evaluationPath, "readiness.evaluation.path");
  const evaluationDocument = readJsonObject(evaluationPath, "golden evaluation report");
  const evaluation = evaluationDocument.value;
  assertEqual(requireSha(evaluationReport, "reportSha256", "freshReadiness.evaluation"), evaluationDocument.sha256, "GOLDEN_REPORT_HASH_MISMATCH", "fresh readiness evaluation report SHA-256");
  assertEqual(requireSha(candidateEvaluationReport, "reportSha256", "readiness.evaluation"), evaluationDocument.sha256, "GOLDEN_REPORT_HASH_MISMATCH", "candidate readiness evaluation report SHA-256");
  assertSameJson(evaluationReport.report, evaluation, "fresh readiness evaluation report");
  assertSameJson(candidateEvaluationReport.report, evaluation, "candidate readiness evaluation report");
  if (evaluation.schema !== "hatab-local-ai-golden-evaluation-v2" || evaluation.passed !== true) {
    fail("GOLDEN_GATE_FAILED", "Golden evaluation report did not pass the v2 gate");
  }
  if (!isRecord(evaluation.gates) || Object.keys(evaluation.gates).length === 0 || Object.values(evaluation.gates).some((value) => value !== true)) {
    fail("GOLDEN_GATE_FAILED", "Every reported golden evaluation gate must be true");
  }
  assertSamePath(requireString(evaluation, "adapterPath", "evaluation"), adapterPath, "evaluation.adapterPath");
  assertEqual(requireSha(evaluation, "contractSha256", "evaluation"), semanticContractHash, "CONTRACT_HASH_MISMATCH", "evaluation contract SHA-256");
  const evaluationPromptHash = typeof evaluation.runtimePromptSha256 === "string"
    ? requireSha(evaluation, "runtimePromptSha256", "evaluation")
    : requireSha(evaluation, "promptSha256", "evaluation");
  assertEqual(evaluationPromptHash, promptHash, "PROMPT_HASH_MISMATCH", "evaluation prompt SHA-256");
  assertEqual(requireSha(evaluation, "adapterManifestSha256", "evaluation"), manifestDocument.sha256, "ARTIFACT_HASH_MISMATCH", "evaluation adapter manifest SHA-256");
  assertEqual(requireSha(evaluationReport, "adapterManifestSha256", "freshReadiness.evaluation"), manifestDocument.sha256, "ARTIFACT_HASH_MISMATCH", "fresh readiness evaluation manifest SHA-256");
  if (evaluation.adapterManifest !== undefined) assertSameJson(evaluation.adapterManifest, manifest, "evaluation adapter manifest");

  const baseModel = requireString(manifest, "baseModel", "trainingManifest");
  const baseModelRevision = requireString(manifest, "baseModelRevision", "trainingManifest");
  if (!BASE_MODEL_REVISION_PATTERN.test(baseModelRevision)) {
    fail("BASE_MODEL_REVISION_UNPINNED", "Training manifest must pin an exact lowercase base-model commit SHA");
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
      approvedBaseModels,
    );
  } catch (error) {
    if (error instanceof ModelPromotionError) throw error;
    fail("BASE_MODEL_PROVENANCE_INVALID", "Could not verify the pinned base-model snapshot", [String(error)]);
  }
  if (!isRecord(manifest.baseModelFilesSha256)) {
    fail("BASE_MODEL_PROVENANCE_INVALID", "Training manifest baseModelFilesSha256 is missing");
  }
  assertSameJson(
    manifest.baseModelFilesSha256,
    baseProvenance.baseModelFilesSha256,
    "training manifest base-model file hashes",
  );
  assertEqual(
    requireSha(manifest, "baseModelArtifactSha256", "trainingManifest"),
    baseProvenance.baseModelArtifactSha256,
    "BASE_MODEL_PROVENANCE_INVALID",
    "base-model artifact SHA-256",
  );
  const identity = {
    baseModel,
    baseModelRevision,
    baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
    adapterModelSha256: modelHash,
    adapterConfigSha256: configHash,
    adapterPath,
    trainingManifestPath: manifestPath,
    adapterConfigPath: configPath,
    evaluationReportPath: evaluationPath,
    trainingManifestSha256: manifestDocument.sha256,
    evaluationReportSha256: evaluationDocument.sha256,
    contractSha256: semanticContractHash,
    promptSha256: promptHash,
  };
  const identityHash = sha256Bytes(Buffer.from(stableStringify(identity), "utf8"));
  const key = `hatab-local-${identityHash.slice(0, 24)}`;
  const runtimeMetadata = manifest.runtime;
  if (!isRecord(runtimeMetadata)) fail("RUNTIME_METADATA_INVALID", "Training manifest runtime metadata is missing");
  const runtime = [
    `python@${requireString(runtimeMetadata, "pythonVersion", "trainingManifest.runtime")}`,
    `torch@${requireString(runtimeMetadata, "torchVersion", "trainingManifest.runtime")}`,
    `transformers@${requireString(runtimeMetadata, "transformersVersion", "trainingManifest.runtime")}`,
    `peft@${requireString(runtimeMetadata, "peftVersion", "trainingManifest.runtime")}`,
  ].join(";");
  const quantization = typeof manifest.quantization === "string" && manifest.quantization.trim()
    ? manifest.quantization.trim()
    : null;
  const datasetHash = requireSha(manifest, "datasetSha256", "trainingManifest");
  const trackedFiles = {
    readiness: { path: readinessFile, sha256: candidateReadiness.sha256 },
    manifest: { path: manifestPath, sha256: manifestDocument.sha256 },
    model: { path: modelPath, sha256: modelHash },
    config: { path: configPath, sha256: configHash },
    evaluation: { path: evaluationPath, sha256: evaluationDocument.sha256 },
    contract: { path: contractPath, sha256: contractDocument.sha256 },
    promptSource: {
      path: path.join(projectRoot, "local-ai", "prompt.py"),
      sha256: sha256File(path.join(projectRoot, "local-ai", "prompt.py")),
    },
    readinessSource: {
      path: path.join(projectRoot, "local-ai", "model_readiness.py"),
      sha256: sha256File(path.join(projectRoot, "local-ai", "model_readiness.py")),
    },
    ...Object.fromEntries(baseProvenance.trackedFiles.map((tracked) => [
      `baseModel:${tracked.relative}`,
      { path: tracked.filePath, sha256: tracked.hash },
    ])),
  };
  const evaluationMetrics = {
    schema: PROMOTION_EVIDENCE_SCHEMA,
    identityHash,
    baseModelRevision,
    baseModelSnapshotPath: baseProvenance.baseModelSnapshotPath,
    baseModelFilesSha256: baseProvenance.baseModelFilesSha256,
    baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
    adapterPath,
    trainingManifestPath: manifestPath,
    adapterConfigPath: configPath,
    evaluationReportPath: evaluationPath,
    readinessReportSha256: candidateReadiness.sha256,
    readinessSemanticSha256: candidateReadinessHash,
    freshReadinessReportSha256: freshReadiness.sha256,
    trainingManifestSha256: manifestDocument.sha256,
    evaluationReportSha256: evaluationDocument.sha256,
    schemaVersion: fresh.schemaVersion,
    contractVersion: fresh.contractVersion,
    contractSha256: semanticContractHash,
    contractFileSha256: contractDocument.sha256,
    promptSha256: promptHash,
    datasetSha256: datasetHash,
    datasetValidationSha256: fresh.dataset.validationSha256,
    adapterModelSha256: modelHash,
    adapterConfigSha256: configHash,
    modelEnabledKinds: enabledKinds,
    readinessGeneratedAt: candidate.generatedAt ?? null,
    verificationGeneratedAt: fresh.generatedAt ?? null,
    goldenMetrics: evaluation.metrics ?? {},
    goldenGates: evaluation.gates,
  };
  return {
    key,
    displayName: `${baseModel} · ${modelHash.slice(0, 12)}`,
    provider: "LOCAL",
    baseModel,
    baseModelRevision,
    baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
    adapter: requireString(manifest, "schema", "trainingManifest"),
    quantization,
    runtime,
    artifactPath: adapterPath,
    artifactChecksum: modelHash,
    promptVersion: `sha256:${promptHash}`,
    toolSchemaVersion: `${fresh.schemaVersion}@${fresh.contractVersion}:${semanticContractHash}`,
    evaluationMetrics: stableStringify(evaluationMetrics),
    evidenceHashes: evaluationMetrics,
    trackedFiles,
  };
}

function assertTrackedFilesUnchanged(candidate) {
  for (const [label, tracked] of Object.entries(candidate.trackedFiles)) {
    if (sha256File(tracked.path) !== tracked.sha256) {
      fail("EVIDENCE_CHANGED_DURING_PROMOTION", `${label} changed while promotion was being verified`);
    }
  }
}

function activeMarkerPayload(candidate) {
  return {
    schema: "hatab-local-ai-active-model-v1",
    activeModelKey: candidate.key,
    modelIdentitySha256: candidate.evidenceHashes.identityHash,
    baseModel: candidate.baseModel,
    baseModelRevision: candidate.baseModelRevision,
    baseModelArtifactSha256: candidate.baseModelArtifactSha256,
    adapter: candidate.artifactPath,
    adapterModelSha256: candidate.evidenceHashes.adapterModelSha256,
    adapterConfigSha256: candidate.evidenceHashes.adapterConfigSha256,
    adapterManifestSha256: candidate.evidenceHashes.trainingManifestSha256,
    evaluationReportSha256: candidate.evidenceHashes.evaluationReportSha256,
    contractSha256: candidate.evidenceHashes.contractSha256,
    promptSha256: candidate.evidenceHashes.promptSha256,
  };
}

function activeMarkerBytes(candidate) {
  return `${stableStringify(activeMarkerPayload(candidate))}\n`;
}

function activeMarkerMatches(candidate) {
  try {
    return fs.readFileSync(candidate.activeMarkerPath, "utf8") === activeMarkerBytes(candidate);
  } catch {
    return false;
  }
}

function writeActiveMarker(candidate) {
  if (activeMarkerMatches(candidate)) return false;
  const directory = path.dirname(candidate.activeMarkerPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.active-model-${process.pid}-${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, activeMarkerBytes(candidate), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, candidate.activeMarkerPath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the primary marker write error.
    }
  }
  return true;
}

function assertModelTable(database) {
  const table = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'AiModelVersion'",
  ).get();
  if (!table) fail("MODEL_REGISTRY_MISSING", "AiModelVersion is missing; run npm run ai:storage-migrate first");
  const columns = new Set(database.prepare('PRAGMA table_info("AiModelVersion")').all().map((column) => column.name));
  const missing = [...REQUIRED_MODEL_COLUMNS].filter((column) => !columns.has(column));
  if (missing.length > 0) fail("MODEL_REGISTRY_INCOMPATIBLE", "AiModelVersion is missing required columns", missing);
}

function criticalRowValues(candidate) {
  return {
    displayName: candidate.displayName,
    provider: candidate.provider,
    baseModel: candidate.baseModel,
    adapter: candidate.adapter,
    quantization: candidate.quantization,
    runtime: candidate.runtime,
    artifactPath: candidate.artifactPath,
    artifactChecksum: candidate.artifactChecksum,
    promptVersion: candidate.promptVersion,
    toolSchemaVersion: candidate.toolSchemaVersion,
  };
}

function assertExistingCandidateCompatible(row, candidate) {
  for (const [field, expected] of Object.entries(criticalRowValues(candidate))) {
    if (row[field] !== expected) {
      fail("MODEL_KEY_COLLISION", `Existing model registry row ${candidate.key} has different ${field}`);
    }
  }
  let metrics;
  try {
    metrics = JSON.parse(row.evaluationMetrics);
  } catch {
    fail("MODEL_REGISTRY_EVIDENCE_INVALID", `Existing model registry row ${candidate.key} has invalid evidence JSON`);
  }
  for (const field of [
    "schema",
    "identityHash",
    "baseModelRevision",
    "baseModelSnapshotPath",
    "baseModelArtifactSha256",
    "adapterPath",
    "trainingManifestPath",
    "adapterConfigPath",
    "evaluationReportPath",
    "readinessSemanticSha256",
    "trainingManifestSha256",
    "evaluationReportSha256",
    "contractSha256",
    "contractFileSha256",
    "promptSha256",
    "adapterModelSha256",
    "adapterConfigSha256",
  ]) {
    if (metrics[field] !== candidate.evidenceHashes[field]) {
      fail("MODEL_REGISTRY_EVIDENCE_MISMATCH", `Existing model registry row ${candidate.key} has different ${field}`);
    }
  }
  if (stableStringify(metrics.baseModelFilesSha256) !== stableStringify(candidate.evidenceHashes.baseModelFilesSha256)) {
    fail("MODEL_REGISTRY_EVIDENCE_MISMATCH", `Existing model registry row ${candidate.key} has different baseModelFilesSha256`);
  }
  if (stableStringify(metrics.goldenGates) !== stableStringify(candidate.evidenceHashes.goldenGates)) {
    fail("MODEL_REGISTRY_EVIDENCE_MISMATCH", `Existing model registry row ${candidate.key} has different goldenGates`);
  }
}

function inspectPromotionState(database, candidate) {
  const activeRows = database.prepare(
    'SELECT * FROM "AiModelVersion" WHERE "isActive" = 1 ORDER BY "id"',
  ).all();
  if (activeRows.length > 1) {
    fail("MULTIPLE_ACTIVE_MODELS", "Model registry contains more than one active version; repair it before promotion");
  }
  if (activeRows[0] && activeRows[0].status !== "ACTIVE") {
    fail("MODEL_REGISTRY_INVARIANT_FAILED", "The active model row does not have ACTIVE status");
  }
  const target = database.prepare('SELECT * FROM "AiModelVersion" WHERE "key" = ?').get(candidate.key);
  if (target) {
    assertExistingCandidateCompatible(target, candidate);
    if (Boolean(target.isActive) && target.status !== "ACTIVE") {
      fail("MODEL_REGISTRY_INVARIANT_FAILED", "The candidate is active without ACTIVE status");
    }
    if (!target.isActive && !["STAGED", "CANARY", "RETIRED"].includes(target.status)) {
      fail("MODEL_REGISTRY_STATE_INVALID", `Cannot promote candidate from status ${target.status}`);
    }
  }
  const operation = target?.isActive
    ? "noop"
    : target
      ? "reactivate"
      : "insert-and-activate";
  return { activeRows, target, operation };
}

function applyPromotion(database, candidate) {
  const promote = database.transaction(() => {
    assertTrackedFilesUnchanged(candidate);
    const state = inspectPromotionState(database, candidate);
    if (state.operation === "noop") {
      const markerChanged = writeActiveMarker(candidate);
      return {
        operation: markerChanged ? "repair-active-marker" : "noop",
        previousKey: candidate.key,
        changed: markerChanged,
      };
    }
    const now = new Date().toISOString();
    const previousKey = state.activeRows[0]?.key ?? null;
    if (state.activeRows[0]) {
      database.prepare(
        `UPDATE "AiModelVersion"
         SET "isActive" = 0, "status" = 'RETIRED', "retiredAt" = ?, "updatedAt" = ?
         WHERE "id" = ?`,
      ).run(now, now, state.activeRows[0].id);
    }
    if (state.target) {
      database.prepare(
        `UPDATE "AiModelVersion"
         SET "isActive" = 1, "status" = 'ACTIVE', "activatedAt" = ?, "retiredAt" = NULL, "updatedAt" = ?
         WHERE "id" = ?`,
      ).run(now, now, state.target.id);
    } else {
      const fields = criticalRowValues(candidate);
      database.prepare(
        `INSERT INTO "AiModelVersion" (
          "key", "displayName", "provider", "baseModel", "adapter", "quantization", "runtime",
          "artifactPath", "artifactChecksum", "promptVersion", "toolSchemaVersion", "evaluationMetrics",
          "status", "isActive", "activatedAt", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?)`,
      ).run(
        candidate.key,
        fields.displayName,
        fields.provider,
        fields.baseModel,
        fields.adapter,
        fields.quantization,
        fields.runtime,
        fields.artifactPath,
        fields.artifactChecksum,
        fields.promptVersion,
        fields.toolSchemaVersion,
        candidate.evaluationMetrics,
        now,
        now,
        now,
      );
    }
    const active = database.prepare(
      'SELECT "key", "status", "isActive" FROM "AiModelVersion" WHERE "isActive" = 1',
    ).all();
    if (active.length !== 1 || active[0].key !== candidate.key || active[0].status !== "ACTIVE") {
      fail("MODEL_ACTIVATION_POSTCONDITION_FAILED", "Atomic activation postcondition failed");
    }
    writeActiveMarker(candidate);
    return { operation: state.operation, previousKey, changed: true };
  });
  return promote.immediate();
}

export function promoteLocalAiModel(options) {
  const projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT);
  const hfHome = resolveHfHome(options.hfHome);
  const readinessPath = fs.realpathSync.native(path.resolve(options.readinessPath));
  const databasePath = fs.realpathSync.native(path.resolve(options.databasePath));
  const candidateReadiness = readJsonObject(readinessPath, "candidate readiness report");
  requireReadyReport(candidateReadiness.value, "readiness");
  const freshReadiness = regenerateReadiness(
    candidateReadiness.value,
    projectRoot,
    options.pythonExecutable ?? resolvePythonExecutable(),
    options.readinessScript,
  );
  const candidate = verifyEvidence(
    candidateReadiness,
    freshReadiness,
    readinessPath,
    projectRoot,
    hfHome,
    options.approvedBaseModels,
  );
  candidate.activeMarkerPath = path.resolve(
    options.activeMarkerPath
      ?? process.env.HATAB_LOCAL_AI_ACTIVE_MARKER_PATH
      ?? (process.platform === "win32"
        ? "D:\\hatab-local-ai\\active-model.json"
        : path.join(projectRoot, ".runtime", "local-ai-active-model.json")),
  );
  const database = new Database(databasePath, { readonly: Boolean(options.dryRun), fileMustExist: true });
  try {
    database.pragma("busy_timeout = 10000");
    database.pragma("foreign_keys = ON");
    if (options.dryRun) database.pragma("query_only = ON");
    assertModelTable(database);
    assertTrackedFilesUnchanged(candidate);
    const state = inspectPromotionState(database, candidate);
    const outcome = options.dryRun
      ? {
          operation: state.operation === "noop" && !activeMarkerMatches(candidate)
            ? "repair-active-marker"
            : state.operation,
          previousKey: state.activeRows[0]?.key ?? null,
          changed: state.operation !== "noop" || !activeMarkerMatches(candidate),
        }
      : applyPromotion(database, candidate);
    return {
      schema: "hatab-local-ai-model-promotion-v1",
      dryRun: Boolean(options.dryRun),
      productionReady: true,
      key: candidate.key,
      baseModel: candidate.baseModel,
      baseModelRevision: candidate.baseModelRevision,
      baseModelArtifactSha256: candidate.baseModelArtifactSha256,
      artifactPath: candidate.artifactPath,
      artifactChecksum: candidate.artifactChecksum,
      contractSha256: candidate.evidenceHashes.contractSha256,
      promptSha256: candidate.evidenceHashes.promptSha256,
      evaluationReportSha256: candidate.evidenceHashes.evaluationReportSha256,
      activeMarkerPath: candidate.activeMarkerPath,
      ...outcome,
    };
  } finally {
    database.close();
  }
}

function parseArguments(argv) {
  const result = {
    readinessPath: path.join(PROJECT_ROOT, "local-ai", "reports", "model-readiness-v2.json"),
    databaseUrl: null,
    hfHome: null,
    activeMarkerPath: null,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      result.dryRun = true;
    } else if (argument === "--readiness") {
      result.readinessPath = argv[++index];
      if (!result.readinessPath) fail("ARGUMENT_INVALID", "--readiness requires a file path");
    } else if (argument === "--database-url") {
      result.databaseUrl = argv[++index];
      if (!result.databaseUrl) fail("ARGUMENT_INVALID", "--database-url requires a file: URL");
    } else if (argument === "--hf-home") {
      result.hfHome = argv[++index];
      if (!result.hfHome) fail("ARGUMENT_INVALID", "--hf-home requires a directory path");
    } else if (argument === "--active-marker") {
      result.activeMarkerPath = argv[++index];
      if (!result.activeMarkerPath) fail("ARGUMENT_INVALID", "--active-marker requires a file path");
    } else {
      fail("ARGUMENT_INVALID", `Unknown argument: ${argument}`);
    }
  }
  return result;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const databaseUrl = args.databaseUrl ?? loadProjectDatabaseUrl(PROJECT_ROOT);
  const result = promoteLocalAiModel({
    readinessPath: args.readinessPath,
    databasePath: resolveDatabasePath(databaseUrl, PROJECT_ROOT),
    dryRun: args.dryRun,
    projectRoot: PROJECT_ROOT,
    hfHome: args.hfHome,
    activeMarkerPath: args.activeMarkerPath,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    const payload = error instanceof ModelPromotionError
      ? { error: error.code, message: error.message, details: error.details }
      : { error: "MODEL_PROMOTION_FAILED", message: error instanceof Error ? error.message : String(error) };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  });
}
