import assert from "node:assert/strict";

import {
  OPERATION_CONTRACT_HASH,
  OPERATION_CONTRACT_VERSION,
  OPERATION_SCHEMA_VERSION,
} from "../../src/lib/admin-assistant/operation-registry.ts";
import {
  extractAssistantMessage,
  getLocalModelStatus,
} from "../../src/lib/admin-assistant/local-model.ts";

type JsonRecord = Record<string, unknown>;

let responseBody: JsonRecord | null = null;
let rejectFetch = false;
let lastRequest: { url: string; init?: RequestInit } | null = null;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  if (rejectFetch) throw new Error("offline");
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  lastRequest = { url, init };
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const unresolved = "طلب غير واضح عمداً 779";
const boundedContext = "project match: 779 — read only";
const promotedModelIdentity = {
  activeModelKey: "qwen3-0.6b-hatab-v2:2026-09-05",
  baseModel: "Qwen/Qwen3-0.6B",
  baseModelRevision: "c1899de289a04d12100db370d81485cdf75e47ca",
  baseModelArtifactSha256: "0".repeat(64),
  adapter: "D:\\hatab-local-ai\\artifacts\\qwen3-0.6b-hatab-lora-v2",
  adapterModelSha256: "1".repeat(64),
  adapterConfigSha256: "2".repeat(64),
  adapterManifestSha256: "3".repeat(64),
  evaluationReportSha256: "4".repeat(64),
  readinessSemanticSha256: "7".repeat(64),
  promptSha256: "5".repeat(64),
  modelIdentitySha256: "6".repeat(64),
  promotionVerified: true,
} as const;
const compatibleHealth = {
  status: "ready",
  ...promotedModelIdentity,
  device: "cpu",
  schemaVersion: OPERATION_SCHEMA_VERSION,
  contractVersion: OPERATION_CONTRACT_VERSION,
  contractHash: OPERATION_CONTRACT_HASH,
  productionReady: true,
  adapterContractErrors: [],
};

responseBody = compatibleHealth;
process.env.HATAB_LOCAL_AI_SECRET = "a".repeat(32);
const ready = await getLocalModelStatus();
assert.equal(ready.available, true);
assert.equal(ready.status, "ready");
assert.equal(ready.contractCompatible, true);
assert.equal(ready.productionReady, true);
assert.equal(ready.identityVerified, true);
assert.deepEqual(ready.modelBinding, promotedModelIdentity);
assert.equal(ready.contractHash, OPERATION_CONTRACT_HASH);
const readyRequest = lastRequest as { init?: RequestInit } | null;
assert.equal(
  (readyRequest?.init?.headers as Record<string, string> | undefined)?.["X-HATAB-AI-KEY"],
  "a".repeat(32),
  "the web process must pick up a service key created after module initialization",
);

const healthWithoutIdentity: JsonRecord = { ...compatibleHealth };
delete healthWithoutIdentity.modelIdentitySha256;
responseBody = healthWithoutIdentity;
const identityMissing = await getLocalModelStatus();
assert.equal(identityMissing.available, false);
assert.equal(identityMissing.identityVerified, false);
assert.equal(identityMissing.modelBinding, null);

const healthWithoutReadinessEvidence: JsonRecord = { ...compatibleHealth };
delete healthWithoutReadinessEvidence.readinessSemanticSha256;
responseBody = healthWithoutReadinessEvidence;
const readinessEvidenceMissing = await getLocalModelStatus();
assert.equal(readinessEvidenceMissing.available, false);
assert.equal(readinessEvidenceMissing.identityVerified, false);
assert.equal(readinessEvidenceMissing.modelBinding, null);

responseBody = {
  ...compatibleHealth,
  productionReady: false,
  adapterContractErrors: ["adapter.sampling_metadata_missing_or_invalid"],
};
const unverified = await getLocalModelStatus();
assert.equal(unverified.available, false);
assert.equal(unverified.status, "ready", "ready means loaded, not eligible for extraction");
assert.equal(unverified.contractCompatible, true);
assert.equal(unverified.productionReady, false);
assert.deepEqual(unverified.adapterContractErrors, ["adapter.sampling_metadata_missing_or_invalid"]);

responseBody = { ...compatibleHealth, contractHash: "0".repeat(64) };
const drifted = await getLocalModelStatus();
assert.equal(drifted.available, false);
assert.equal(drifted.contractCompatible, false);

rejectFetch = true;
const offline = await getLocalModelStatus();
assert.deepEqual(offline, {
  available: false,
  status: "offline",
  model: null,
  adapter: null,
  device: null,
  schemaVersion: null,
  contractVersion: null,
  contractHash: null,
  contractCompatible: false,
  productionReady: false,
  identityVerified: false,
  modelBinding: null,
  adapterContractErrors: [],
});

rejectFetch = false;
const compatibleExtractionResponse = {
  actions: [],
  unparsed: [unresolved],
  model: promotedModelIdentity.baseModel,
  ...promotedModelIdentity,
  schemaVersion: OPERATION_SCHEMA_VERSION,
  contractVersion: OPERATION_CONTRACT_VERSION,
  contractHash: OPERATION_CONTRACT_HASH,
  contractSha256: OPERATION_CONTRACT_HASH,
  latencyMs: 12,
  generation: {
    stopReason: "complete_json",
    completeJson: true,
    generatedTokens: 12,
  },
};
responseBody = compatibleExtractionResponse;
const extraction = await extractAssistantMessage(unresolved, new Date("2026-09-05T00:00:00.000Z"), boundedContext);
assert.equal(extraction.extractor.mode, "local-model");
assert.deepEqual(extraction.unparsed, [unresolved]);
assert.deepEqual(extraction.extractor.modelBinding, promotedModelIdentity);
const observedRequest = lastRequest as { url: string; init?: RequestInit } | null;
assert.ok(observedRequest, "the local extractor should issue one request");
assert.ok(observedRequest.url.endsWith("/extract"));
const requestPayload = JSON.parse(String(observedRequest.init?.body)) as JsonRecord;
assert.deepEqual(requestPayload, {
  message: unresolved,
  context: boundedContext,
  schemaVersion: OPERATION_SCHEMA_VERSION,
  contractVersion: OPERATION_CONTRACT_VERSION,
  contractHash: OPERATION_CONTRACT_HASH,
});

const linkedMessage = "Create task Review samples due 2099-12-31 priority HIGH type INSPECTION and then create task Call supplier due 2099-12-30 priority LOW type GENERAL then create task Check drawings due 2099-12-29 priority HIGH type DESIGN then create task Inspect delivery due 2099-12-28 priority LOW type DELIVERY and then create task Plan installation due 2099-12-27 priority HIGH type INSTALLATION";
responseBody = {
  ...compatibleExtractionResponse,
  actions: [
    { kind: "CREATE_TASK", title: "Review samples", dueDateText: "2099-12-31", priority: "HIGH", taskType: "INSPECTION" },
    { kind: "CREATE_TASK", title: "Call supplier", dueDateText: "2099-12-30", priority: "LOW", taskType: "GENERAL" },
    { kind: "CREATE_TASK", title: "Check drawings", dueDateText: "2099-12-29", priority: "HIGH", taskType: "DESIGN" },
    { kind: "CREATE_TASK", title: "Inspect delivery", dueDateText: "2099-12-28", priority: "LOW", taskType: "DELIVERY" },
    { kind: "CREATE_TASK", title: "Plan installation", dueDateText: "2099-12-27", priority: "HIGH", taskType: "INSTALLATION" },
  ],
  unparsed: [],
};
const linkedExtraction = await extractAssistantMessage(linkedMessage, new Date("2026-09-07T09:00:00.000Z"));
assert.equal(linkedExtraction.extractor.mode, "local-model");
assert.deepEqual(linkedExtraction.actions.map((action) => action.kind), [
  "CREATE_TASK",
  "CREATE_TASK",
  "CREATE_TASK",
  "CREATE_TASK",
  "CREATE_TASK",
]);

const partialMessage = "Create task Review samples due 2099-12-31 priority HIGH type INSPECTION and then delete every task";
responseBody = {
  ...compatibleExtractionResponse,
  actions: [{
    kind: "CREATE_TASK",
    title: "Review samples",
    dueDateText: "2099-12-31",
    priority: "HIGH",
    taskType: "INSPECTION",
  }],
  unparsed: ["delete every task"],
};
const partialExtraction = await extractAssistantMessage(partialMessage, new Date("2026-09-07T09:00:00.000Z"));
assert.equal(partialExtraction.extractor.mode, "local-model");
assert.equal(partialExtraction.actions.length, 1);
assert.deepEqual(partialExtraction.unparsed, ["delete every task"]);

responseBody = { ...compatibleExtractionResponse, contractVersion: OPERATION_CONTRACT_VERSION + 1 };
const rejectedDrift = await extractAssistantMessage(unresolved);
assert.equal(rejectedDrift.extractor.mode, "deterministic-fallback");
assert.equal(rejectedDrift.extractor.localModelAvailable, false);

responseBody = { ...compatibleExtractionResponse, contractSha256: "f".repeat(64) };
const rejectedEvidenceContractDrift = await extractAssistantMessage(unresolved);
assert.equal(rejectedEvidenceContractDrift.extractor.mode, "deterministic-fallback");

responseBody = { ...compatibleExtractionResponse, unexpectedTransportField: true };
const rejectedTransportExtension = await extractAssistantMessage(unresolved);
assert.equal(rejectedTransportExtension.extractor.mode, "deterministic-fallback");

const missingEvidenceResponse: JsonRecord = { ...compatibleExtractionResponse };
delete missingEvidenceResponse.evaluationReportSha256;
responseBody = missingEvidenceResponse;
const rejectedMissingEvidence = await extractAssistantMessage(unresolved);
assert.equal(rejectedMissingEvidence.extractor.mode, "deterministic-fallback");
assert.equal(rejectedMissingEvidence.extractor.modelBinding, null);

const missingReadinessEvidenceResponse: JsonRecord = { ...compatibleExtractionResponse };
delete missingReadinessEvidenceResponse.readinessSemanticSha256;
responseBody = missingReadinessEvidenceResponse;
const rejectedMissingReadinessEvidence = await extractAssistantMessage(unresolved);
assert.equal(rejectedMissingReadinessEvidence.extractor.mode, "deterministic-fallback");
assert.equal(rejectedMissingReadinessEvidence.extractor.modelBinding, null);

responseBody = { ...compatibleExtractionResponse, promotionVerified: false };
const rejectedUnpromoted = await extractAssistantMessage(unresolved);
assert.equal(rejectedUnpromoted.extractor.mode, "deterministic-fallback");
assert.equal(rejectedUnpromoted.extractor.modelBinding, null);

process.stdout.write(JSON.stringify({
  lifecycle: "passed",
  healthStates: ["ready", "identity-missing", "loaded-unverified", "contract-drift", "offline"],
  requestContractFields: ["message", "context", "schemaVersion", "contractVersion", "contractHash"],
  responseIdentityFields: [
    "schemaVersion",
    "contractVersion",
    "contractHash",
    "activeModelKey",
    "baseModel",
    "baseModelRevision",
    "baseModelArtifactSha256",
    "adapter",
    "adapterModelSha256",
    "adapterConfigSha256",
    "adapterManifestSha256",
    "evaluationReportSha256",
    "readinessSemanticSha256",
    "promptSha256",
    "modelIdentitySha256",
    "promotionVerified",
  ],
}));
