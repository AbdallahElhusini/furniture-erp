import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveSessionSecret } from "@/lib/session";
import {
  OPERATION_CONTRACT_HASH,
  OPERATION_CONTRACT_VERSION,
  OPERATION_SCHEMA_VERSION,
} from "./operation-registry";
import type { AssistantPlan } from "./types";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASE_MODEL_REVISION_PATTERN = /^[a-f0-9]{40}$/;
const MODEL_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidModelBinding(plan: AssistantPlan): boolean {
  if (!("modelBinding" in plan)) return false;
  if (plan.modelBinding === null) return true;
  const binding = plan.modelBinding;
  return binding.promotionVerified === true
    && MODEL_KEY_PATTERN.test(binding.activeModelKey)
    && BASE_MODEL_REVISION_PATTERN.test(binding.baseModelRevision)
    && [binding.baseModel, binding.adapter].every((value) => (
      typeof value === "string" && value.trim().length > 0
    ))
    && [
      binding.adapterModelSha256,
      binding.adapterConfigSha256,
      binding.adapterManifestSha256,
      binding.baseModelArtifactSha256,
      binding.evaluationReportSha256,
      binding.modelIdentitySha256,
      binding.readinessSemanticSha256,
      binding.promptSha256,
    ].every((value) => SHA256_PATTERN.test(value));
}

function hasUniqueActionIds(plan: AssistantPlan): boolean {
  if (!Array.isArray(plan.actions) || plan.actions.length === 0 || plan.actions.length > 25) {
    return false;
  }
  const ids = plan.actions.map((action) => (
    isRecord(action) && typeof action.id === "string" ? action.id : ""
  ));
  return ids.every((id) => id.length > 0 && id.length <= 200)
    && new Set(ids).size === ids.length;
}

function signature(value: string): string {
  return createHmac("sha256", resolveSessionSecret())
    .update(`hatab-admin-assistant-v2.${value}`)
    .digest("base64url");
}

export function createAssistantPlanToken(plan: AssistantPlan): string {
  const encoded = Buffer.from(JSON.stringify(plan), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyAssistantPlanToken(token: string, actorId: number): AssistantPlan | null {
  const segments = token.split(".");
  if (segments.length !== 2) return null;
  const [encoded, suppliedSignature] = segments;
  if (!encoded || !suppliedSignature) return null;

  const expected = Buffer.from(signature(encoded));
  const actual = Buffer.from(suppliedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const plan = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AssistantPlan;
    if (
      plan.version !== 2 ||
      !plan.planId ||
      plan.actorId !== actorId ||
      plan.operationContract?.schemaVersion !== OPERATION_SCHEMA_VERSION ||
      plan.operationContract?.contractVersion !== OPERATION_CONTRACT_VERSION ||
      plan.operationContract?.hash !== OPERATION_CONTRACT_HASH ||
      !hasValidModelBinding(plan) ||
      !hasUniqueActionIds(plan) ||
      Number.isNaN(Date.parse(plan.expiresAt)) ||
      Date.parse(plan.expiresAt) <= Date.now()
    ) {
      return null;
    }
    return plan;
  } catch {
    return null;
  }
}
