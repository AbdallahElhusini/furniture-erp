import "server-only";

import { readFileSync } from "node:fs";
import { parseAssistantMessage, type ParseAssistantResult } from "./parser.ts";
import { validateLocalModelEnvelope } from "./local-model-contract.ts";
import {
  OPERATION_CONTRACT_HASH,
  OPERATION_CONTRACT_VERSION,
  OPERATION_SCHEMA_VERSION,
} from "./operation-registry.ts";
import type { AssistantModelBinding } from "./types.ts";

const LOCAL_AI_URL = (process.env.HATAB_LOCAL_AI_URL ?? "http://127.0.0.1:11437").replace(/\/$/, "");
const LOCAL_AI_SECRET_FILE = process.env.HATAB_LOCAL_AI_SECRET_FILE
  ?? "D:\\hatab-local-ai\\service.key";

function resolveLocalAiSecret(): string {
  const configured = process.env.HATAB_LOCAL_AI_SECRET?.trim();
  if (configured) return configured;
  try {
    return readFileSync(LOCAL_AI_SECRET_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

// Keep a small transport margin over local-ai/generation.py's hard 240-second
// CPU ceiling so the service can return explicit truncation metadata.
const EXTRACT_TIMEOUT_MS = 245_000;
const HEALTH_TIMEOUT_MS = 2_500;
const MAX_MODEL_CONTEXT_CHARACTERS = 6_000;

export interface AssistantExtractorInfo {
  mode: "deterministic" | "local-model" | "deterministic-fallback";
  localModelAvailable: boolean | null;
  model: string | null;
  latencyMs: number | null;
  modelBinding: AssistantModelBinding | null;
}

export interface AssistantExtractionResult extends ParseAssistantResult {
  extractor: AssistantExtractorInfo;
}

function headers(): HeadersInit {
  // The supported launcher creates the key on the local AI service's first
  // start. The web process may already be running in deterministic-fallback
  // mode, so resolve it per request instead of pinning an empty value at
  // module-import time.
  const localAiSecret = resolveLocalAiSecret();
  return localAiSecret ? { "X-HATAB-AI-KEY": localAiSecret } : {};
}

async function fetchJson(path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(`${LOCAL_AI_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Local AI returned ${response.status}`);
  return response.json();
}

export async function getLocalModelStatus(): Promise<{
  available: boolean;
  status: string;
  model: string | null;
  adapter: string | null;
  device: string | null;
  schemaVersion: string | null;
  contractVersion: number | null;
  contractHash: string | null;
  contractCompatible: boolean;
  productionReady: boolean;
  identityVerified: boolean;
  modelBinding: AssistantModelBinding | null;
  adapterContractErrors: string[];
}> {
  try {
    const value = await fetchJson("/health", { method: "GET" }, HEALTH_TIMEOUT_MS);
    if (!value || typeof value !== "object") throw new Error("Invalid health result");
    const record = value as Record<string, unknown>;
    const schemaVersion = typeof record.schemaVersion === "string" ? record.schemaVersion : null;
    const contractVersion = Number.isSafeInteger(record.contractVersion) ? Number(record.contractVersion) : null;
    const contractHash = typeof record.contractHash === "string" ? record.contractHash : null;
    const contractCompatible = schemaVersion === OPERATION_SCHEMA_VERSION
      && contractVersion === OPERATION_CONTRACT_VERSION
      && contractHash === OPERATION_CONTRACT_HASH;
    const productionReady = record.productionReady === true;
    let modelBinding: AssistantModelBinding | null = null;
    try {
      modelBinding = modelBindingFromResponse(record);
    } catch {
      // A loaded service without complete promoted-model evidence is not executable.
    }
    return {
      available: record.status === "ready" && contractCompatible && productionReady && modelBinding !== null,
      status: typeof record.status === "string" ? record.status : "unknown",
      model: typeof record.baseModel === "string" ? record.baseModel : null,
      adapter: typeof record.adapter === "string" ? record.adapter : null,
      device: typeof record.device === "string" ? record.device : null,
      schemaVersion,
      contractVersion,
      contractHash,
      contractCompatible,
      productionReady,
      identityVerified: modelBinding !== null,
      modelBinding,
      adapterContractErrors: Array.isArray(record.adapterContractErrors)
        ? record.adapterContractErrors.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  } catch {
    return {
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
    };
  }
}

function boundedModelContext(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const bounded = value
    .replace(/\0/g, "")
    .trim()
    .slice(0, MAX_MODEL_CONTEXT_CHARACTERS);
  return bounded || undefined;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASE_MODEL_REVISION_PATTERN = /^[a-f0-9]{40}$/;
const MODEL_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const EXTRACTION_RESPONSE_FIELDS = new Set([
  "actions",
  "unparsed",
  "model",
  "activeModelKey",
  "baseModel",
  "baseModelRevision",
  "baseModelArtifactSha256",
  "modelIdentitySha256",
  "adapter",
  "adapterModelSha256",
  "adapterConfigSha256",
  "adapterManifestSha256",
  "evaluationReportSha256",
  "readinessSemanticSha256",
  "promptSha256",
  "promotionVerified",
  "schemaVersion",
  "contractVersion",
  "contractSha256",
  "contractHash",
  "latencyMs",
  // Diagnostic metadata emitted by local-ai/serve.py. It is intentionally
  // ignored by the application, but it is part of the service wire response.
  "generation",
]);

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Local AI response is missing ${key}`);
  }
  return value.trim();
}

function requiredSha256(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`Local AI response has an invalid ${key}`);
  }
  return value;
}

function modelBindingFromResponse(record: Record<string, unknown>): AssistantModelBinding {
  const activeModelKey = requiredString(record, "activeModelKey");
  if (!MODEL_KEY_PATTERN.test(activeModelKey) || record.promotionVerified !== true) {
    throw new Error("Local AI response is not bound to a promoted model version");
  }
  const baseModelRevision = requiredString(record, "baseModelRevision");
  if (!BASE_MODEL_REVISION_PATTERN.test(baseModelRevision)) {
    throw new Error("Local AI response is not pinned to an immutable base-model revision");
  }
  return {
    activeModelKey,
    baseModel: requiredString(record, "baseModel"),
    baseModelRevision,
    baseModelArtifactSha256: requiredSha256(record, "baseModelArtifactSha256"),
    modelIdentitySha256: requiredSha256(record, "modelIdentitySha256"),
    adapter: requiredString(record, "adapter"),
    adapterModelSha256: requiredSha256(record, "adapterModelSha256"),
    adapterConfigSha256: requiredSha256(record, "adapterConfigSha256"),
    adapterManifestSha256: requiredSha256(record, "adapterManifestSha256"),
    evaluationReportSha256: requiredSha256(record, "evaluationReportSha256"),
    readinessSemanticSha256: requiredSha256(record, "readinessSemanticSha256"),
    promptSha256: requiredSha256(record, "promptSha256"),
    promotionVerified: true,
  };
}

export async function extractAssistantMessage(
  message: string,
  now = new Date(),
  modelContext?: string,
): Promise<AssistantExtractionResult> {
  const deterministic = parseAssistantMessage(message, now);
  if (deterministic.unparsed.length === 0) {
    return {
      ...deterministic,
      extractor: {
        mode: "deterministic",
        localModelAvailable: null,
        model: null,
        latencyMs: null,
        modelBinding: null,
      },
    };
  }

  // Give the model the complete request. Sending only the clauses that the
  // deterministic parser missed loses the user's original left-to-right
  // ordering when a single sentence mixes familiar and novel operations.
  const modelInput = message;
  try {
    const startedAt = Date.now();
    const raw = await fetchJson(
      "/extract",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: modelInput,
          context: boundedModelContext(modelContext),
          schemaVersion: OPERATION_SCHEMA_VERSION,
          contractVersion: OPERATION_CONTRACT_VERSION,
          contractHash: OPERATION_CONTRACT_HASH,
        }),
      },
      EXTRACT_TIMEOUT_MS,
    );
    if (!raw || typeof raw !== "object") throw new Error("Invalid local AI response");
    const responseRecord = raw as Record<string, unknown>;
    if (
      responseRecord.schemaVersion !== OPERATION_SCHEMA_VERSION
      || responseRecord.contractVersion !== OPERATION_CONTRACT_VERSION
      || responseRecord.contractHash !== OPERATION_CONTRACT_HASH
      || responseRecord.contractSha256 !== OPERATION_CONTRACT_HASH
      || Object.keys(responseRecord).some((key) => !EXTRACTION_RESPONSE_FIELDS.has(key))
    ) {
      throw new Error("Local AI operation contract does not match the application contract");
    }
    const validated = validateLocalModelEnvelope({
      actions: responseRecord.actions,
      unparsed: responseRecord.unparsed,
    }, modelInput, now);
    if (!validated) throw new Error("Local AI response failed the deterministic contract");
    const record = responseRecord;
    const modelBinding = modelBindingFromResponse(record);
    if (record.model !== modelBinding.baseModel) {
      throw new Error("Local AI display model does not match its promoted binding");
    }
    return {
      // The promoted model must compile the whole message as one ordered plan.
      // Its envelope is already contract- and grounding-validated above.
      actions: validated.actions,
      unparsed: validated.unparsed,
      extractor: {
        mode: "local-model",
        localModelAvailable: true,
        model: modelBinding.baseModel,
        latencyMs: typeof record.latencyMs === "number" ? record.latencyMs : Date.now() - startedAt,
        modelBinding,
      },
    };
  } catch {
    return {
      ...deterministic,
      extractor: {
        mode: "deterministic-fallback",
        localModelAvailable: false,
        model: null,
        latencyMs: null,
        modelBinding: null,
      },
    };
  }
}
