import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import {
  APPROVED_BASE_MODELS,
  assertApprovedBaseModelProvenance,
  deriveBaseModelProvenance,
} from "../scripts/local-ai-base-provenance.mjs";
import {
  ActiveModelResolutionError,
  resolveActiveLocalAiModel,
} from "../scripts/resolve-active-local-ai-model.mjs";

const PYTHON = process.env.HATAB_TEST_PYTHON || "python";

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function expectCode(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof ActiveModelResolutionError);
    assert.equal(error.code, code);
    return true;
  });
}

function createFixture(context) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hatab-active-model-"));
  const adapterPath = path.join(projectRoot, "adapter");
  const contractDirectory = path.join(projectRoot, "contracts");
  const localAiDirectory = path.join(projectRoot, "local-ai");
  fs.mkdirSync(adapterPath);
  fs.mkdirSync(contractDirectory);
  fs.mkdirSync(localAiDirectory);

  const baseModel = "Qwen/test-model";
  const baseModelRevision = "c1899de289a04d12100db370d81485cdf75e47ca";
  const hfHome = path.join(projectRoot, "hf-cache");
  const baseSnapshot = path.join(
    hfHome,
    "hub",
    "models--Qwen--test-model",
    "snapshots",
    baseModelRevision,
  );
  fs.mkdirSync(baseSnapshot, { recursive: true });
  fs.writeFileSync(path.join(baseSnapshot, "config.json"), "{}\n");
  fs.writeFileSync(path.join(baseSnapshot, "model.safetensors"), "base-model-test-weights");
  fs.writeFileSync(path.join(baseSnapshot, "tokenizer.json"), "{}\n");
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

  const contract = {
    schemaVersion: "hatab-admin-assistant-operations/v2",
    contractVersion: 2,
    operations: {},
  };
  const contractPath = path.join(contractDirectory, "admin-assistant-operations.v2.json");
  fs.writeFileSync(contractPath, JSON.stringify(contract));
  const contractSha256 = sha256(stableStringify(contract));
  const contractFileSha256 = sha256File(contractPath);
  const promptSha256 = "b".repeat(64);
  fs.writeFileSync(
    path.join(localAiDirectory, "prompt.py"),
    `def prompt_sha256():\n    return "${promptSha256}"\n`,
  );

  const modelPath = path.join(adapterPath, "adapter_model.safetensors");
  const configPath = path.join(adapterPath, "adapter_config.json");
  fs.writeFileSync(modelPath, "verified-adapter");
  fs.writeFileSync(configPath, JSON.stringify({ peft_type: "LORA" }));
  const modelSha256 = sha256File(modelPath);
  const configSha256 = sha256File(configPath);
  const runtime = {
    pythonVersion: "3.12.1",
    torchVersion: "2.8.0",
    transformersVersion: "4.56.0",
    peftVersion: "0.17.0",
  };
  const manifest = {
    schema: "hatab-erp-intent-lora-v2",
    baseModel,
    baseModelRevision,
    baseModelFilesSha256: baseProvenance.baseModelFilesSha256,
    baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
    adapterPath,
    adapterModelSha256: modelSha256,
    adapterConfigSha256: configSha256,
    contractSha256,
    contractFileSha256,
    promptSha256,
    schemaVersion: contract.schemaVersion,
    contractVersion: contract.contractVersion,
    runtime,
  };
  const manifestPath = path.join(adapterPath, "hatab-training-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const manifestSha256 = sha256File(manifestPath);

  const evaluation = {
    schema: "hatab-local-ai-golden-evaluation-v2",
    passed: true,
    gates: { contract: true, exactMatch: true },
    adapterPath,
    baseModel,
    adapterManifestSha256: manifestSha256,
    contractSha256,
    runtimePromptSha256: promptSha256,
  };
  const evaluationPath = path.join(projectRoot, "golden-evaluation.json");
  fs.writeFileSync(evaluationPath, JSON.stringify(evaluation));
  const evaluationSha256 = sha256File(evaluationPath);
  const identity = {
    baseModel,
    baseModelRevision,
    baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
    adapterModelSha256: modelSha256,
    adapterConfigSha256: configSha256,
    adapterPath,
    trainingManifestPath: manifestPath,
    adapterConfigPath: configPath,
    evaluationReportPath: evaluationPath,
    trainingManifestSha256: manifestSha256,
    evaluationReportSha256: evaluationSha256,
    contractSha256,
    promptSha256,
  };
  const identityHash = sha256(stableStringify(identity));
  const key = `hatab-local-${identityHash.slice(0, 24)}`;
  const evidence = {
    schema: "hatab-local-ai-promotion-evidence-v2",
    identityHash,
    baseModelRevision,
    baseModelSnapshotPath: baseProvenance.baseModelSnapshotPath,
    baseModelFilesSha256: baseProvenance.baseModelFilesSha256,
    baseModelArtifactSha256: baseProvenance.baseModelArtifactSha256,
    adapterPath,
    trainingManifestPath: manifestPath,
    adapterConfigPath: configPath,
    evaluationReportPath: evaluationPath,
    readinessSemanticSha256: "c".repeat(64),
    trainingManifestSha256: manifestSha256,
    evaluationReportSha256: evaluationSha256,
    schemaVersion: contract.schemaVersion,
    contractVersion: contract.contractVersion,
    contractSha256,
    contractFileSha256,
    promptSha256,
    adapterModelSha256: modelSha256,
    adapterConfigSha256: configSha256,
    goldenGates: evaluation.gates,
  };

  const databasePath = path.join(projectRoot, "registry.db");
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE "AiModelVersion" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "isActive" INTEGER NOT NULL,
      "provider" TEXT NOT NULL,
      "baseModel" TEXT NOT NULL,
      "adapter" TEXT,
      "runtime" TEXT NOT NULL,
      "artifactPath" TEXT,
      "artifactChecksum" TEXT,
      "promptVersion" TEXT NOT NULL,
      "toolSchemaVersion" TEXT NOT NULL,
      "evaluationMetrics" TEXT NOT NULL
    )
  `);
  const runtimeIdentity = [
    `python@${runtime.pythonVersion}`,
    `torch@${runtime.torchVersion}`,
    `transformers@${runtime.transformersVersion}`,
    `peft@${runtime.peftVersion}`,
  ].join(";");
  const insert = database.prepare(`
    INSERT INTO "AiModelVersion" (
      "key", "status", "isActive", "provider", "baseModel", "adapter", "runtime",
      "artifactPath", "artifactChecksum", "promptVersion", "toolSchemaVersion",
      "evaluationMetrics"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertActive = (overrides = {}) => insert.run(
    overrides.key ?? key,
    overrides.status ?? "ACTIVE",
    overrides.isActive ?? 1,
    overrides.provider ?? "LOCAL",
    overrides.baseModel ?? baseModel,
    overrides.adapter ?? manifest.schema,
    overrides.runtime ?? runtimeIdentity,
    overrides.artifactPath ?? adapterPath,
    overrides.artifactChecksum ?? modelSha256,
    overrides.promptVersion ?? `sha256:${promptSha256}`,
    overrides.toolSchemaVersion
      ?? `${contract.schemaVersion}@${contract.contractVersion}:${contractSha256}`,
    JSON.stringify(overrides.evidence ?? evidence),
  );
  const resolve = () => resolveActiveLocalAiModel(databasePath, {
    projectRoot,
    pythonExecutable: PYTHON,
    hfHome,
    approvedBaseModels,
  });
  context.after(() => {
    database.close();
    fs.rmSync(projectRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  });
  return {
    projectRoot,
    hfHome,
    adapterPath,
    modelPath,
    configPath,
    manifestPath,
    evaluationPath,
    database,
    databasePath,
    insertActive,
    resolve,
    key,
    identityHash,
    baseModel,
    baseModelRevision,
    baseProvenance,
    approvedBaseModels,
    modelSha256,
    configSha256,
    manifestSha256,
    evaluationSha256,
    contractSha256,
    promptSha256,
    evidence,
  };
}

test("runtime resolves the exact promoted active adapter identity", (context) => {
  const fixture = createFixture(context);
  expectCode(fixture.resolve, "ACTIVE_MODEL_MISSING");
  fixture.insertActive();
  const resolved = fixture.resolve();
  assert.deepEqual(resolved, {
    key: fixture.key,
    identityHash: fixture.identityHash,
    baseModel: fixture.baseModel,
    baseModelRevision: fixture.baseModelRevision,
    baseModelSnapshotPath: fixture.baseProvenance.baseModelSnapshotPath,
    baseModelArtifactSha256: fixture.baseProvenance.baseModelArtifactSha256,
    artifactPath: fs.realpathSync.native(fixture.adapterPath),
    artifactChecksum: fixture.modelSha256,
    adapterModelSha256: fixture.modelSha256,
    adapterConfigSha256: fixture.configSha256,
    adapterManifestSha256: fixture.manifestSha256,
    evaluationReportPath: fs.realpathSync.native(fixture.evaluationPath),
    evaluationReportSha256: fixture.evaluationSha256,
    readinessSemanticSha256: "c".repeat(64),
    contractSha256: fixture.contractSha256,
    promptSha256: fixture.promptSha256,
  });
});

for (const [name, target] of [
  ["model", "modelPath"],
  ["config", "configPath"],
  ["manifest", "manifestPath"],
  ["golden evaluation", "evaluationPath"],
]) {
  test(`runtime rejects ${name} bytes changed after promotion`, (context) => {
    const fixture = createFixture(context);
    fixture.insertActive();
    fs.appendFileSync(fixture[target], target === "manifestPath" || target === "evaluationPath" ? "\n " : "tampered");
    expectCode(fixture.resolve, "ACTIVE_MODEL_ARTIFACT_TAMPERED");
  });
}

test("runtime rejects changed bytes in the pinned base-model snapshot", (context) => {
  const fixture = createFixture(context);
  fixture.insertActive();
  fs.appendFileSync(
    path.join(fixture.baseProvenance.baseModelSnapshotPath, "model.safetensors"),
    "tampered",
  );
  expectCode(fixture.resolve, "ACTIVE_MODEL_BASE_PROVENANCE_INVALID");
});

test("production policy hard-pins the approved base aggregate and key artifacts", () => {
  const approved = APPROVED_BASE_MODELS["Qwen/Qwen3-0.6B"];
  assert.equal(approved.revision, "c1899de289a04d12100db370d81485cdf75e47ca");
  assert.equal(
    approved.artifactSha256,
    "83b219f3770500a1c934947299c4b53491e3921be4e281c30f083147d9143fa5",
  );
  assert.equal(
    approved.requiredFilesSha256["model.safetensors"],
    "f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b",
  );
  assert.equal(
    approved.requiredFilesSha256["tokenizer.json"],
    "aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4",
  );
  assert.throws(
    () => assertApprovedBaseModelProvenance({
      baseModel: "Qwen/Qwen3-0.6B",
      provenance: {
        baseModelRevision: approved.revision,
        baseModelArtifactSha256: "0".repeat(64),
        baseModelFilesSha256: approved.requiredFilesSha256,
      },
    }),
    /aggregate does not match/,
  );
});

test("runtime rejects failed gates and legacy or forged promotion evidence", (context) => {
  const failedGate = createFixture(context);
  failedGate.insertActive({
    evidence: { ...failedGate.evidence, goldenGates: { contract: true, exactMatch: false } },
  });
  expectCode(failedGate.resolve, "ACTIVE_MODEL_NOT_PRODUCTION_READY");

  const legacy = createFixture(context);
  legacy.insertActive({ evidence: { ...legacy.evidence, schema: "hatab-local-ai-promotion-evidence-v1" } });
  expectCode(legacy.resolve, "ACTIVE_MODEL_EVIDENCE_INVALID");

  const forgedKey = createFixture(context);
  forgedKey.insertActive({ key: "hatab-local-forged" });
  expectCode(forgedKey.resolve, "ACTIVE_MODEL_IDENTITY_MISMATCH");
});

test("runtime rejects current prompt drift and multiple active rows", (context) => {
  const drift = createFixture(context);
  drift.insertActive();
  fs.writeFileSync(
    path.join(drift.projectRoot, "local-ai", "prompt.py"),
    `def prompt_sha256():\n    return "${"d".repeat(64)}"\n`,
  );
  expectCode(drift.resolve, "ACTIVE_MODEL_CONTRACT_DRIFT");

  const duplicate = createFixture(context);
  duplicate.insertActive();
  duplicate.insertActive({ key: `${duplicate.key}-duplicate` });
  expectCode(duplicate.resolve, "MULTIPLE_ACTIVE_MODELS");
});

test("launcher always resolves the registry and requires the full serving identity", () => {
  const launcher = fs.readFileSync(
    path.resolve(import.meta.dirname, "..", "local-ai", "start.ps1"),
    "utf8",
  );
  assert.doesNotMatch(launcher, /if\s*\(\s*-not\s+\$env:HATAB_LOCAL_AI_ADAPTER/i);
  assert.match(launcher, /node\s+\$ActiveModelResolver/i);
  for (const field of [
    "activeModelKey",
    "modelIdentitySha256",
    "baseModel",
    "baseModelRevision",
    "baseModelArtifactSha256",
    "adapterModelSha256",
    "adapterConfigSha256",
    "adapterManifestSha256",
    "evaluationReportSha256",
    "contractSha256",
    "promptSha256",
    "productionReady",
    "promotionVerified",
  ]) {
    assert.match(launcher, new RegExp(field, "i"));
  }
});
