import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import Database from "better-sqlite3";
import { deriveBaseModelProvenance } from "../scripts/local-ai-base-provenance.mjs";
import { migrateAiOperations } from "../scripts/migrate-ai-operations.mjs";
import {
  ModelPromotionError,
  promoteLocalAiModel,
} from "../scripts/promote-local-ai-model.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceDatabase = path.join(projectRoot, "dev.db");
const dataManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "local-ai", "data", "manifest.json"), "utf8"));
const goldenPath = path.join(projectRoot, "local-ai", "data", "golden-evaluation.v2.jsonl");
const goldenCases = fs.readFileSync(goldenPath, "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const goldenEligibleCaseIds = goldenCases.map((entry) => entry.id).sort();

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runReadinessGate(adapterPath, evaluationPath, outputPath, hfHome, readinessScript) {
  const result = spawnSync("python", [
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
    env: { ...process.env, HATAB_LOCAL_AI_HF_HOME: hfHome, HF_HOME: hfHome },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 25 * 1024 * 1024,
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
}

function createReadyCandidate(directory, suffix) {
  const baseModel = "Qwen/Qwen3-0.6B";
  const baseModelRevision = "c1899de289a04d12100db370d81485cdf75e47ca";
  const hfHome = path.join(directory, "hf-cache");
  const baseSnapshot = path.join(
    hfHome,
    "hub",
    "models--Qwen--Qwen3-0.6B",
    "snapshots",
    baseModelRevision,
  );
  if (!fs.existsSync(baseSnapshot)) {
    fs.mkdirSync(baseSnapshot, { recursive: true });
    const refsDirectory = path.join(hfHome, "hub", "models--Qwen--Qwen3-0.6B", "refs");
    fs.mkdirSync(refsDirectory, { recursive: true });
    // Promotion is bound to the concrete approved revision, never the mutable
    // repository main ref. A moved main ref must not invalidate that snapshot.
    fs.writeFileSync(path.join(refsDirectory, "main"), `${"f".repeat(40)}\n`);
    fs.writeFileSync(path.join(baseSnapshot, "config.json"), "{}\n");
    fs.writeFileSync(path.join(baseSnapshot, "model.safetensors"), "base-model-test-weights");
    fs.writeFileSync(path.join(baseSnapshot, "tokenizer.json"), "{}\n");
  }
  const baseProvenance = deriveBaseModelProvenance({
    baseModel,
    revision: baseModelRevision,
    hfHome,
  });
  const approvedBaseModels = {
    [baseModel]: {
      revision: baseModelRevision,
      artifactSha256: baseProvenance.baseModelArtifactSha256,
      requiredFilesSha256: baseProvenance.baseModelFilesSha256,
    },
  };
  const readinessScript = path.join(directory, "test-model-readiness.py");
  if (!fs.existsSync(readinessScript)) {
    const provenanceModule = path.join(projectRoot, "local-ai");
    const productionReadinessScript = path.join(provenanceModule, "model_readiness.py");
    fs.writeFileSync(readinessScript, [
      "import runpy, sys",
      `sys.path.insert(0, ${JSON.stringify(provenanceModule)})`,
      "import base_model_provenance as provenance",
      `provenance.APPROVED_BASE_MODEL_ARTIFACT_SHA256 = ${JSON.stringify(baseProvenance.baseModelArtifactSha256)}`,
      `provenance.APPROVED_BASE_MODEL_KEY_FILES_SHA256 = ${JSON.stringify(baseProvenance.baseModelFilesSha256)}`,
      `runpy.run_path(${JSON.stringify(productionReadinessScript)}, run_name='__main__')`,
      "",
    ].join("\n"));
  }
  const adapterPath = path.join(directory, `adapter-${suffix}`);
  fs.mkdirSync(adapterPath, { recursive: true });
  const modelPath = path.join(adapterPath, "adapter_model.safetensors");
  const configPath = path.join(adapterPath, "adapter_config.json");
  const manifestPath = path.join(adapterPath, "hatab-training-manifest.json");
  const evaluationPath = path.join(directory, `evaluation-${suffix}.json`);
  const readinessPath = path.join(directory, `readiness-${suffix}.json`);
  fs.writeFileSync(modelPath, Buffer.from(`immutable-model-${suffix}`));
  fs.writeFileSync(configPath, `${JSON.stringify({ rank: 8, suffix }, null, 2)}\n`);
  const trainingManifest = {
    schema: "hatab-erp-intent-lora-v2",
    baseModel,
    baseModelRevision,
    baseModelFilesSha256: baseProvenance.baseModelFilesSha256,
    baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
    adapterPath: path.resolve(adapterPath),
    adapterModelSha256: sha256File(modelPath),
    adapterConfigSha256: sha256File(configPath),
    datasetPath: path.join(projectRoot, "local-ai", "data", "train.jsonl"),
    datasetSha256: dataManifest.trainSha256,
    datasetRows: dataManifest.trainRows,
    sampling: {
      policy: "balanced-round-robin",
      seed: 260901,
      sourceRows: dataManifest.modelEnabledKinds.length + 2,
      sampledRows: dataManifest.modelEnabledKinds.length + 2,
      bucketCount: dataManifest.modelEnabledKinds.length + 2,
      sourceBucketCounts: Object.fromEntries([
        ...dataManifest.modelEnabledKinds.map((kind) => [kind, 1]),
        ["__ABSTAIN__", 1],
        ["__MULTI__", 1],
      ]),
      sampledBucketCounts: Object.fromEntries([
        ...dataManifest.modelEnabledKinds.map((kind) => [kind, 1]),
        ["__ABSTAIN__", 1],
        ["__MULTI__", 1],
      ]),
      bucketWeights: Object.fromEntries([
        ...dataManifest.modelEnabledKinds.map((kind) => [kind, 1]),
        ["__ABSTAIN__", 1],
        ["__MULTI__", 1],
      ]),
      weightedCycleSize: dataManifest.modelEnabledKinds.length + 2,
      observedKinds: dataManifest.modelEnabledKinds,
      requiredKinds: dataManifest.modelEnabledKinds,
      abstentionRequired: true,
      abstentionPresent: true,
      targetRowsPerBucket: 1,
      oversampledRows: 0,
      oversampledByBucket: Object.fromEntries([
        ...dataManifest.modelEnabledKinds.map((kind) => [kind, 0]),
        ["__ABSTAIN__", 0],
        ["__MULTI__", 0],
      ]),
      orderSha256: "a".repeat(64),
    },
    maxLength: 384,
    optimizerSteps: 120,
    gradientAccumulation: 1,
    learningRate: 0.00005,
    datasetKinds: dataManifest.modelEnabledKinds,
    modelEnabledKindsAtTraining: dataManifest.modelEnabledKinds,
    promptSha256: dataManifest.promptSha256,
    schemaVersion: dataManifest.schemaVersion,
    contractVersion: dataManifest.contractVersion,
    contractSha256: dataManifest.contractSha256,
    contractFileSha256: dataManifest.contractFileSha256,
    registeredKinds: dataManifest.registeredKinds,
    modelEnabledKinds: dataManifest.modelEnabledKinds,
    runtime: {
      pythonVersion: "3.11.9",
      pythonImplementation: "CPython",
      platform: "test",
      executable: "python",
      torchVersion: "2.5.1+cpu",
      transformersVersion: "4.57.6",
      peftVersion: "0.18.1",
      threads: 1,
    },
    seed: 260901,
    torchVersion: "test",
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(trainingManifest, null, 2)}\n`);
  const adapterManifestSha256 = sha256File(manifestPath);
  const evaluation = {
    schema: "hatab-local-ai-golden-evaluation-v2",
    generatedAt: new Date().toISOString(),
    evaluationScope: "model-enabled",
    schemaVersion: dataManifest.schemaVersion,
    contractVersion: dataManifest.contractVersion,
    contractSha256: dataManifest.contractSha256,
    contractFileSha256: dataManifest.contractFileSha256,
    registeredKinds: dataManifest.registeredKinds,
    modelEnabledKinds: dataManifest.modelEnabledKinds,
    promptSha256: dataManifest.promptSha256,
    runtimePromptSha256: dataManifest.promptSha256,
    metrics: {
      samples: goldenEligibleCaseIds.length,
      validJsonRate: 1,
      contractValidRate: 1,
      actionKindsExactRate: 1,
      exactMatchRate: 1,
      abstentionCorrectRate: 1,
      multiActionSamples: goldenCases.filter((entry) => entry.expected.actions.length >= 2).length,
      multiActionExactRate: 1,
    },
    gateThresholds: {
      contractValidRate: 1,
      actionKindExactRate: 0.95,
      exactMatchRate: 0.9,
      abstentionCorrectRate: 1,
      multiActionExactRate: 1,
    },
    gates: {
      contractValidRate: true,
      actionKindExactRate: true,
      exactMatchRate: true,
      abstentionCorrectRate: true,
      multiActionExactRate: true,
    },
    passed: true,
    baseModel: trainingManifest.baseModel,
    baseModelRevision: trainingManifest.baseModelRevision,
    baseModelFilesSha256: trainingManifest.baseModelFilesSha256,
    baseModelArtifactSha256: trainingManifest.baseModelArtifactSha256,
    adapterPath: trainingManifest.adapterPath,
    adapterManifestSha256,
    adapterManifest: trainingManifest,
    goldenFixture: true,
    goldenFixtureSha256: sha256File(goldenPath),
    goldenSemanticSha256: createHash("sha256").update(stableStringify(goldenCases)).digest("hex"),
    goldenTotalCaseCount: goldenCases.length,
    goldenEligibleCaseCount: goldenEligibleCaseIds.length,
    goldenEligibleCaseIds,
    selectedKinds: [],
    naturalOnly: false,
    evaluatedCaseIds: goldenEligibleCaseIds,
    evaluatedCaseCount: goldenEligibleCaseIds.length,
    missingPredictionIds: [],
    unexpectedPredictionIds: [],
    datasetPath: goldenPath,
    datasetSha256: sha256File(goldenPath),
    latencyMs: { mean: 1, p50: 1, p95: 1, max: 1 },
    results: goldenEligibleCaseIds.map((id) => ({ id })),
  };
  fs.writeFileSync(evaluationPath, `${JSON.stringify(evaluation, null, 2)}\n`);
  runReadinessGate(adapterPath, evaluationPath, readinessPath, hfHome, readinessScript);
  return {
    adapterPath,
    modelPath,
    configPath,
    manifestPath,
    evaluationPath,
    readinessPath,
    hfHome,
    baseModelFilesSha256: baseProvenance.baseModelFilesSha256,
    approvedBaseModels,
    readinessScript,
  };
}

async function createIsolatedDatabase(directory) {
  const databasePath = path.join(directory, "registry.db");
  const source = new Database(sourceDatabase, { readonly: true, fileMustExist: true });
  try {
    await source.backup(databasePath);
  } finally {
    source.close();
  }
  const database = new Database(databasePath);
  try {
    migrateAiOperations(database);
    database.pragma("foreign_keys = ON");
    database.prepare('DELETE FROM "AiModelVersion"').run();
  } finally {
    database.close();
  }
  return databasePath;
}

function expectPromotionError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof ModelPromotionError);
    assert.equal(error.code, code);
    return true;
  });
}

test("promotion is gated, dry-run safe, atomic, idempotent, and artifact-read-only", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-model-promotion-"));
  context.after(() => fs.rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  }));
  const databasePath = await createIsolatedDatabase(directory);
  const first = createReadyCandidate(directory, "first");
  const previousHfHome = process.env.HATAB_LOCAL_AI_HF_HOME;
  const previousMarkerPath = process.env.HATAB_LOCAL_AI_ACTIVE_MARKER_PATH;
  const activeMarkerPath = path.join(directory, "active-model.json");
  process.env.HATAB_LOCAL_AI_HF_HOME = first.hfHome;
  process.env.HATAB_LOCAL_AI_ACTIVE_MARKER_PATH = activeMarkerPath;
  const promote = (options) => promoteLocalAiModel({
    ...options,
    approvedBaseModels: first.approvedBaseModels,
    readinessScript: first.readinessScript,
  });
  context.after(() => {
    if (previousHfHome === undefined) delete process.env.HATAB_LOCAL_AI_HF_HOME;
    else process.env.HATAB_LOCAL_AI_HF_HOME = previousHfHome;
    if (previousMarkerPath === undefined) delete process.env.HATAB_LOCAL_AI_ACTIVE_MARKER_PATH;
    else process.env.HATAB_LOCAL_AI_ACTIVE_MARKER_PATH = previousMarkerPath;
  });
  const artifactHashesBefore = [first.modelPath, first.configPath, first.manifestPath, first.evaluationPath]
    .map(sha256File);

  const failedReadinessPath = path.join(directory, "failed-readiness.json");
  const failedReadiness = JSON.parse(fs.readFileSync(first.readinessPath, "utf8"));
  failedReadiness.productionReady = false;
  failedReadiness.blockers = ["evaluation.gates_not_passed"];
  fs.writeFileSync(failedReadinessPath, `${JSON.stringify(failedReadiness, null, 2)}\n`);
  expectPromotionError(() => promote({
    readinessPath: failedReadinessPath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  }), "READINESS_GATE_FAILED");

  const dryRun = promote({
    readinessPath: first.readinessPath,
    databasePath,
    projectRoot,
    dryRun: true,
    pythonExecutable: "python",
  });
  assert.equal(dryRun.operation, "insert-and-activate");
  assert.equal(dryRun.changed, true);
  assert.equal(dryRun.productionReady, true);
  assert.equal(fs.existsSync(activeMarkerPath), false);
  let database = new Database(databasePath, { readonly: true });
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM "AiModelVersion"').get().count, 0);
  database.close();

  const promoted = promote({
    readinessPath: first.readinessPath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  });
  assert.equal(promoted.operation, "insert-and-activate");
  assert.equal(promoted.changed, true);
  assert.equal(promoted.baseModelRevision, "c1899de289a04d12100db370d81485cdf75e47ca");
  assert.match(promoted.baseModelArtifactSha256, /^[a-f0-9]{64}$/);
  const activeMarker = JSON.parse(fs.readFileSync(activeMarkerPath, "utf8"));
  assert.equal(activeMarker.activeModelKey, promoted.key);
  database = new Database(databasePath, { readonly: true });
  const firstRow = database.prepare('SELECT * FROM "AiModelVersion" WHERE "key" = ?').get(promoted.key);
  assert.equal(firstRow.status, "ACTIVE");
  assert.equal(firstRow.isActive, 1);
  assert.equal(firstRow.artifactChecksum, sha256File(first.modelPath));
  const storedEvidence = JSON.parse(firstRow.evaluationMetrics);
  assert.equal(activeMarker.modelIdentitySha256, storedEvidence.identityHash);
  assert.equal(storedEvidence.schema, "hatab-local-ai-promotion-evidence-v2");
  assert.equal(storedEvidence.contractSha256, dataManifest.contractSha256);
  assert.equal(storedEvidence.promptSha256, dataManifest.promptSha256);
  assert.equal(storedEvidence.baseModelRevision, promoted.baseModelRevision);
  assert.equal(storedEvidence.baseModelArtifactSha256, promoted.baseModelArtifactSha256);
  assert.deepEqual(storedEvidence.baseModelFilesSha256, first.baseModelFilesSha256);
  assert.equal(storedEvidence.adapterPath, fs.realpathSync.native(first.adapterPath));
  assert.equal(storedEvidence.trainingManifestPath, fs.realpathSync.native(first.manifestPath));
  assert.equal(storedEvidence.adapterConfigPath, fs.realpathSync.native(first.configPath));
  assert.equal(storedEvidence.evaluationReportPath, fs.realpathSync.native(first.evaluationPath));
  database.close();

  const replay = promote({
    readinessPath: first.readinessPath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  });
  assert.equal(replay.operation, "noop");
  assert.equal(replay.changed, false);
  database = new Database(databasePath, { readonly: true });
  const replayRow = database.prepare('SELECT * FROM "AiModelVersion" WHERE "key" = ?').get(promoted.key);
  assert.deepEqual(replayRow, firstRow);
  database.close();

  fs.writeFileSync(activeMarkerPath, "{}\n");
  const repairedMarker = promote({
    readinessPath: first.readinessPath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  });
  assert.equal(repairedMarker.operation, "repair-active-marker");
  assert.equal(repairedMarker.changed, true);
  assert.equal(JSON.parse(fs.readFileSync(activeMarkerPath, "utf8")).activeModelKey, promoted.key);

  const second = createReadyCandidate(directory, "second");
  const secondPromotion = promote({
    readinessPath: second.readinessPath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  });
  assert.equal(secondPromotion.operation, "insert-and-activate");
  assert.equal(secondPromotion.previousKey, promoted.key);
  database = new Database(databasePath, { readonly: true });
  const rows = database.prepare(
    'SELECT "key", "status", "isActive", "retiredAt" FROM "AiModelVersion" ORDER BY "id"',
  ).all();
  assert.deepEqual(rows.map((row) => [row.key, row.status, row.isActive]), [
    [promoted.key, "RETIRED", 0],
    [secondPromotion.key, "ACTIVE", 1],
  ]);
  assert.ok(rows[0].retiredAt);
  assert.equal(database.prepare(
    'SELECT COUNT(*) AS count FROM "AiModelVersion" WHERE "isActive" = 1 AND "status" = \'ACTIVE\'',
  ).get().count, 1);
  database.close();

  assert.deepEqual(
    [first.modelPath, first.configPath, first.manifestPath, first.evaluationPath].map(sha256File),
    artifactHashesBefore,
    "promotion must never write model evidence or artifacts",
  );

  const tampered = createReadyCandidate(directory, "tampered");
  fs.appendFileSync(tampered.modelPath, "tampered-after-readiness");
  expectPromotionError(() => promote({
    readinessPath: tampered.readinessPath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  }), "READINESS_REGENERATION_FAILED");
  database = new Database(databasePath, { readonly: true });
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM "AiModelVersion"').get().count, 2);
  assert.equal(database.prepare('SELECT "key" FROM "AiModelVersion" WHERE "isActive" = 1').get().key, secondPromotion.key);
  database.close();

  const stalePath = path.join(directory, "stale-contract-readiness.json");
  const stale = JSON.parse(fs.readFileSync(second.readinessPath, "utf8"));
  stale.contractSha256 = "0".repeat(64);
  fs.writeFileSync(stalePath, `${JSON.stringify(stale, null, 2)}\n`);
  expectPromotionError(() => promote({
    readinessPath: stalePath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  }), "STALE_READINESS_REPORT");

  const stalePromptPath = path.join(directory, "stale-prompt-readiness.json");
  const stalePrompt = JSON.parse(fs.readFileSync(second.readinessPath, "utf8"));
  stalePrompt.promptSha256 = "1".repeat(64);
  fs.writeFileSync(stalePromptPath, `${JSON.stringify(stalePrompt, null, 2)}\n`);
  expectPromotionError(() => promote({
    readinessPath: stalePromptPath,
    databasePath,
    projectRoot,
    dryRun: false,
    pythonExecutable: "python",
  }), "STALE_READINESS_REPORT");

  database = new Database(databasePath);
  database.prepare(
    `UPDATE "AiModelVersion"
     SET "isActive" = 1, "status" = 'ACTIVE', "retiredAt" = NULL
     WHERE "key" = ?`,
  ).run(promoted.key);
  database.close();
  expectPromotionError(() => promote({
    readinessPath: second.readinessPath,
    databasePath,
    projectRoot,
    dryRun: true,
    pythonExecutable: "python",
  }), "MULTIPLE_ACTIVE_MODELS");
});
