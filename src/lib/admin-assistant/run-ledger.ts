import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getOperationDefinition,
  hashCanonicalValue,
  OPERATION_CONTRACT_HASH,
  OPERATION_CONTRACT_VERSION,
  OPERATION_SCHEMA_VERSION,
} from "./operation-registry";
import { verifyAssistantPlanToken } from "./plan-token";
import type {
  AssistantApplyResult,
  AssistantModelBinding,
  AssistantPlan,
  AssistantPreview,
} from "./types";

export interface AssistantLedgerActor {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface AssistantRunReference {
  conversationId: string;
  runId: string;
  status: string;
  planRevision: number | null;
  planHash: string | null;
}

export interface PlanningLedger {
  conversationDbId: number;
  conversationPublicId: string;
  messageDbId: number;
  runDbId: number;
  runPublicId: string;
}

export interface ExecutionLedger {
  runDbId: number;
  runPublicId: string;
  conversationDbId: number;
  planDbId: number;
  selectedActionIds: string[];
  startedAt: Date;
  alreadyCompleted: boolean;
}

const PHONE_PATTERN = /(?<!\d)(?:\+?20)?0?1[0125][\d\s-]{7,12}(?!\d)/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function redactText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, (phone) => {
      const digits = phone.replace(/\D/g, "");
      return `[REDACTED_PHONE:*${digits.slice(-4)}]`;
    });
}

function redactValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (/phone|email|address/i.test(key)) return redactText(value).replace(value, `[REDACTED_${key.toUpperCase()}]`);
    return redactText(value);
  }
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => (
      [entryKey, redactValue(entry, entryKey)]
    )));
  }
  return value;
}

function serializedRedacted(value: unknown): string {
  return JSON.stringify(redactValue(value));
}

function comparableArtifactPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function parseModelEvidence(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The generic binding failure below avoids exposing registry internals.
  }
  return {};
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Preserve a valid ledger update even if an older usage payload is malformed.
  }
  return {};
}

async function resolveBoundModelVersion(
  tx: Prisma.TransactionClient,
  binding: AssistantModelBinding | null,
  options: { requireActive?: boolean } = {},
) {
  if (!binding) return null;
  const model = await tx.aiModelVersion.findUnique({
    where: { key: binding.activeModelKey },
  });
  const activeModelIds = options.requireActive === false
    ? []
    : (await tx.aiModelVersion.findMany({
        where: { provider: "LOCAL", status: "ACTIVE", isActive: true },
        select: { id: true },
        take: 2,
      })).map((entry) => entry.id);
  const evidence = model ? parseModelEvidence(model.evaluationMetrics) : {};
  const expectedToolSchemaVersion = `${OPERATION_SCHEMA_VERSION}@${OPERATION_CONTRACT_VERSION}:${OPERATION_CONTRACT_HASH}`;
  const activeStateIsValid = options.requireActive === false
    ? ["ACTIVE", "RETIRED"].includes(model?.status ?? "")
    : model?.status === "ACTIVE"
      && model.isActive
      && activeModelIds.length === 1
      && activeModelIds[0] === model.id;
  const valid = model
    && binding.promotionVerified === true
    && model.provider === "LOCAL"
    && activeStateIsValid
    && model.baseModel === binding.baseModel
    && evidence.baseModelRevision === binding.baseModelRevision
    && evidence.baseModelArtifactSha256 === binding.baseModelArtifactSha256
    && evidence.identityHash === binding.modelIdentitySha256
    && evidence.readinessSemanticSha256 === binding.readinessSemanticSha256
    && typeof model.artifactPath === "string"
    && comparableArtifactPath(model.artifactPath) === comparableArtifactPath(binding.adapter)
    && model.artifactChecksum === binding.adapterModelSha256
    && model.promptVersion === `sha256:${binding.promptSha256}`
    && model.toolSchemaVersion === expectedToolSchemaVersion
    && evidence.adapterModelSha256 === binding.adapterModelSha256
    && evidence.adapterConfigSha256 === binding.adapterConfigSha256
    && evidence.trainingManifestSha256 === binding.adapterManifestSha256
    && evidence.evaluationReportSha256 === binding.evaluationReportSha256
    && evidence.promptSha256 === binding.promptSha256;
  if (!valid || !model) {
    throw new Error("إصدار النموذج الذي أنشأ المعاينة لم يعد هو الإصدار النشط الموثّق. أعد المعاينة.");
  }
  return model;
}

function riskRank(risk: string): number {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }[risk] ?? 0;
}

function highestRisk(actions: AssistantPreview["actions"]): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  return actions.reduce<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">(
    (highest, action) => riskRank(action.risk) > riskRank(highest) ? action.risk : highest,
    "LOW",
  );
}

function previewSummary(preview: AssistantPreview): string {
  if (preview.blockingIssues.length > 0) return `تحتاج الخطة إلى توضيح: ${preview.blockingIssues.join(" ")}`;
  if (preview.actions.length === 0) return preview.warnings.join(" ") || "لا توجد تغييرات قابلة للتنفيذ.";
  return `تم تجهيز ${preview.actions.length} إجراء للمراجعة والموافقة.`;
}

function planMetadata(plan: AssistantPlan): Omit<AssistantPlan, "actions"> {
  return {
    version: plan.version,
    planId: plan.planId,
    actorId: plan.actorId,
    actorEmail: plan.actorEmail,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    operationContract: plan.operationContract,
    modelBinding: plan.modelBinding,
    warnings: plan.warnings,
  };
}

function normalizeSelectedPlanSubset(originalPlan: AssistantPlan, selectedPlan: AssistantPlan): AssistantPlan {
  if (selectedPlan.actions.length === 0) {
    throw new Error("خطة التنفيذ المحددة لا تحتوي على أي إجراء.");
  }
  if (hashCanonicalValue(planMetadata(selectedPlan)) !== hashCanonicalValue(planMetadata(originalPlan))) {
    throw new Error("بيانات خطة التنفيذ المحددة لا تطابق المعاينة الموقعة.");
  }

  const originalActions = new Map(originalPlan.actions.map((action) => [action.id, action] as const));
  if (originalActions.size !== originalPlan.actions.length) {
    throw new Error("خطة المعاينة الموقعة تحتوي على معرفات إجراءات مكررة.");
  }
  const selectedActionIds = new Set<string>();
  for (const selectedAction of selectedPlan.actions) {
    if (selectedActionIds.has(selectedAction.id)) {
      throw new Error("خطة التنفيذ المحددة تحتوي على معرفات إجراءات مكررة.");
    }
    selectedActionIds.add(selectedAction.id);
    const originalAction = originalActions.get(selectedAction.id);
    if (!originalAction || hashCanonicalValue(originalAction) !== hashCanonicalValue(selectedAction)) {
      throw new Error("أحد إجراءات التنفيذ المحددة لا يطابق المعاينة الموقعة.");
    }
  }
  return {
    ...selectedPlan,
    actions: originalPlan.actions.filter((action) => selectedActionIds.has(action.id)),
  };
}

export async function beginAssistantPlanning(input: {
  message: string;
  actor: AssistantLedgerActor;
  conversationPublicId?: string;
}): Promise<PlanningLedger> {
  const message = input.message.trim();
  if (!message) throw new Error("Assistant run cannot start without a message");

  return prisma.$transaction(async (tx) => {
    let conversation = null;
    if (input.conversationPublicId) {
      conversation = await tx.aiConversation.findFirst({
        where: {
          publicId: input.conversationPublicId,
          actorId: input.actor.id,
          status: "ACTIVE",
        },
      });
      if (!conversation) throw new Error("المحادثة غير موجودة أو لم تعد متاحة لهذا الحساب.");
    }
    conversation ??= await tx.aiConversation.create({
      data: {
        locale: /[\u0600-\u06ff]/.test(message) ? "ar" : "en",
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        title: redactText(message).slice(0, 120),
        metadata: JSON.stringify({ source: "ADMIN_ASSISTANT", role: input.actor.role }),
      },
    });

    const userMessage = await tx.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: message,
        contentRedacted: redactText(message),
        actorId: input.actor.id,
        actorEmail: input.actor.email,
      },
    });
    const run = await tx.aiRun.create({
      data: {
        conversationId: conversation.id,
        triggerMessageId: userMessage.id,
        status: "PLANNING",
        mode: "PREVIEW",
        inputHash: hashCanonicalValue({ message }),
        inputSnapshot: serializedRedacted({ message }),
        schemaVersion: 2,
        toolSchemaVersion: OPERATION_SCHEMA_VERSION,
        policyVersion: "hatab-assistant-policy-v1",
        maxSteps: 25,
        startedAt: new Date(),
      },
    });
    await tx.aiConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    return {
      conversationDbId: conversation.id,
      conversationPublicId: conversation.publicId,
      messageDbId: userMessage.id,
      runDbId: run.id,
      runPublicId: run.publicId,
    };
  });
}

export async function failAssistantPlanning(
  ledger: PlanningLedger,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown planning error";
  await prisma.aiRun.updateMany({
    where: { id: ledger.runDbId, status: "PLANNING" },
    data: {
      status: "FAILED",
      errorCode: "PLANNING_FAILED",
      errorMessage: redactText(message).slice(0, 1000),
      completedAt: new Date(),
    },
  });
}

export async function finalizeAssistantPreview(
  ledger: PlanningLedger,
  preview: AssistantPreview,
  actor: AssistantLedgerActor,
): Promise<AssistantPreview> {
  const signedPlan = preview.planToken ? verifyAssistantPlanToken(preview.planToken, actor.id) : null;
  if (preview.planToken && !signedPlan) throw new Error("Generated assistant plan could not be verified");
  const extractorModelBinding = preview.extractor.mode === "local-model"
    ? preview.extractor.modelBinding
    : null;
  if (preview.extractor.mode === "local-model" && !extractorModelBinding) {
    throw new Error("Local model output is missing immutable promotion evidence");
  }
  if (
    signedPlan
    && hashCanonicalValue(signedPlan.modelBinding) !== hashCanonicalValue(extractorModelBinding)
  ) {
    throw new Error("Signed assistant plan model binding does not match the extractor");
  }
  if (
    signedPlan
    && hashCanonicalValue({
      actions: signedPlan.actions,
      warnings: signedPlan.warnings,
      expiresAt: signedPlan.expiresAt,
      operationContract: signedPlan.operationContract,
    }) !== hashCanonicalValue({
      actions: preview.actions,
      warnings: preview.warnings,
      expiresAt: preview.expiresAt,
      operationContract: preview.operationContract,
    })
  ) {
    throw new Error("Signed assistant plan does not match the preview being persisted");
  }
  const planHash = hashCanonicalValue(signedPlan ?? {
    actions: preview.actions,
    warnings: preview.warnings,
    blockingIssues: preview.blockingIssues,
    modelBinding: extractorModelBinding,
  });
  const runStatus = preview.planToken
    ? "WAITING_APPROVAL"
    : preview.blockingIssues.length > 0
      ? "WAITING_INPUT"
      : "SUCCEEDED";
  const riskLevel = highestRisk(preview.actions);
  const now = new Date();

  const plan = await prisma.$transaction(async (tx) => {
    const activeModel = await resolveBoundModelVersion(tx, extractorModelBinding);
    const createdPlan = await tx.aiPlan.create({
      data: {
        runId: ledger.runDbId,
        revision: 1,
        status: preview.planToken ? "READY" : "DRAFT",
        summary: previewSummary(preview),
        actions: serializedRedacted(preview.actions),
        warnings: serializedRedacted(preview.warnings),
        assumptions: "[]",
        planHash,
      },
    });

    for (const [index, action] of preview.actions.entries()) {
      const operation = getOperationDefinition(action.kind);
      const step = await tx.aiStep.create({
        data: {
          runId: ledger.runDbId,
          planId: createdPlan.id,
          sequence: index,
          key: action.id,
          kind: action.kind,
          title: action.title,
          status: preview.planToken ? "READY" : "BLOCKED",
          toolName: operation.handler,
          riskLevel: action.risk,
          requiresApproval: true,
          input: serializedRedacted(action.payload),
          idempotencyKey: `ai-step:${ledger.runPublicId}:${action.id}`,
        },
      });
      await tx.aiPolicyDecision.create({
        data: {
          runId: ledger.runDbId,
          stepId: step.id,
          policyKey: "assistant.explicit-approval",
          policyVersion: "v1",
          effect: "REQUIRE_APPROVAL",
          reason: operation.destructive
            ? "Destructive operation requires explicit human approval"
            : "ERP mutations require explicit human approval",
          evaluationInput: serializedRedacted({
            kind: action.kind,
            risk: action.risk,
            destructive: operation.destructive,
            actorRole: actor.role,
          }),
          evaluationOutput: JSON.stringify({ allowedToPreview: true, approvalRequired: true }),
        },
      });
    }

    if (preview.planToken) {
      await tx.aiApproval.create({
        data: {
          runId: ledger.runDbId,
          planId: createdPlan.id,
          status: "PENDING",
          scope: "EXECUTE_SELECTED_PLAN_ACTIONS",
          riskLevel,
          requiredRole: riskLevel === "HIGH" ? "ADMIN_OR_MANAGER" : actor.role,
          requestedById: actor.id,
          requestedByEmail: actor.email,
          requestSnapshot: serializedRedacted({ planHash, actionIds: preview.actions.map((action) => action.id) }),
          expiresAt: preview.expiresAt ? new Date(preview.expiresAt) : null,
        },
      });
    }

    await tx.aiMessage.create({
      data: {
        conversationId: ledger.conversationDbId,
        runId: ledger.runDbId,
        role: "ASSISTANT",
        content: preview.conversation?.reply ?? previewSummary(preview),
        contentRedacted: redactText(preview.conversation?.reply ?? previewSummary(preview)),
        metadata: JSON.stringify({ actionCount: preview.actions.length, riskLevel, conversation: preview.conversation }),
      },
    });
    await tx.aiRun.update({
      where: { id: ledger.runDbId },
      data: {
        status: runStatus,
        intent: preview.actions.map((action) => action.kind).join(",") || "CLARIFICATION",
        riskLevel,
        requiresApproval: Boolean(preview.planToken),
        modelVersionId: activeModel?.id ?? null,
        usage: serializedRedacted({
          extractor: preview.extractor,
          operationContract: preview.operationContract,
        }),
        resultSummary: previewSummary(preview),
        ...(runStatus === "SUCCEEDED" ? { completedAt: now } : {}),
      },
    });
    return createdPlan;
  });

  return {
    ...preview,
    run: {
      conversationId: ledger.conversationPublicId,
      runId: ledger.runPublicId,
      status: runStatus,
      planRevision: plan.revision,
      planHash,
    },
  };
}

export async function beginAssistantExecution(input: {
  runPublicId: string;
  originalPlan: AssistantPlan;
  selectedPlan: AssistantPlan;
  actor: AssistantLedgerActor;
}): Promise<ExecutionLedger> {
  const selectedPlan = normalizeSelectedPlanSubset(input.originalPlan, input.selectedPlan);
  const selectedActionIds = selectedPlan.actions.map((action) => action.id);
  const originalHash = hashCanonicalValue(input.originalPlan);
  const selectedHash = hashCanonicalValue(selectedPlan);
  const startedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const run = await tx.aiRun.findFirst({
      where: { publicId: input.runPublicId },
      include: {
        conversation: { select: { id: true, actorId: true } },
        plans: { orderBy: { revision: "desc" }, take: 1 },
      },
    });
    if (!run || run.conversation.actorId !== input.actor.id) {
      throw new Error("تشغيل المساعد غير موجود أو لا يخص هذا الحساب.");
    }
    if (
      run.schemaVersion !== input.originalPlan.version
      || run.toolSchemaVersion !== input.originalPlan.operationContract.schemaVersion
    ) {
      throw new Error("إصدار سجل التشغيل لا يطابق عقد الخطة الموقعة. أعد المعاينة.");
    }
    const completedRecoveryJob = run.status === "EXECUTING"
      ? await tx.dataTransferJob.findUnique({
          where: { idempotencyKey: `admin-assistant:${input.originalPlan.planId}` },
          select: { status: true },
        })
      : null;
    const boundModel = await resolveBoundModelVersion(tx, input.originalPlan.modelBinding, {
      requireActive: run.status !== "SUCCEEDED" && completedRecoveryJob?.status !== "SUCCESS",
    });
    if (run.modelVersionId !== (boundModel?.id ?? null)) {
      throw new Error("ارتباط نموذج التشغيل لا يطابق النموذج الذي أنشأ المعاينة. أعد المعاينة.");
    }
    if (run.status === "SUCCEEDED") {
      const completedPlan = run.plans[0];
      if (!completedPlan || completedPlan.planHash !== selectedHash) {
        throw new Error("خطة إعادة التشغيل لا تطابق الخطة المكتملة.");
      }
      return {
        runDbId: run.id,
        runPublicId: run.publicId,
        conversationDbId: run.conversation.id,
        planDbId: completedPlan.id,
        selectedActionIds,
        startedAt,
        alreadyCompleted: true,
      };
    }
    if (run.status === "EXECUTING") {
      const executingPlan = run.plans[0];
      if (!executingPlan || executingPlan.status !== "EXECUTING" || executingPlan.planHash !== selectedHash) {
        throw new Error("خطة الاسترداد لا تطابق التنفيذ الجاري.");
      }
      if (completedRecoveryJob?.status !== "SUCCESS") {
        throw new Error("تشغيل المساعد قيد التنفيذ بالفعل ولا يمكن استرداده قبل اكتمال عملية البيانات.");
      }
      return {
        runDbId: run.id,
        runPublicId: run.publicId,
        conversationDbId: run.conversation.id,
        planDbId: executingPlan.id,
        selectedActionIds,
        startedAt: run.startedAt ?? startedAt,
        alreadyCompleted: false,
      };
    }
    if (run.status !== "WAITING_APPROVAL") {
      throw new Error("تشغيل المساعد ليس في حالة انتظار الموافقة.");
    }
    const activePlan = run.plans[0];
    if (!activePlan || activePlan.status !== "READY" || activePlan.planHash !== originalHash) {
      throw new Error("خطة التشغيل المحفوظة لا تطابق المعاينة الموقعة.");
    }
    const claimedRun = await tx.aiRun.updateMany({
      where: { id: run.id, status: "WAITING_APPROVAL" },
      data: { status: "EXECUTING", mode: "EXECUTE", startedAt },
    });
    if (claimedRun.count !== 1) {
      throw new Error("تشغيل المساعد بدأ بالفعل بواسطة طلب آخر.");
    }

    let executionPlan = activePlan;
    if (selectedHash !== originalHash) {
      executionPlan = await tx.aiPlan.create({
        data: {
          runId: run.id,
          revision: activePlan.revision + 1,
          status: "APPROVED",
          summary: `Selected ${selectedActionIds.length} of ${input.originalPlan.actions.length} actions`,
          actions: serializedRedacted(selectedPlan.actions),
          warnings: serializedRedacted(selectedPlan.warnings),
          assumptions: "[]",
          planHash: selectedHash,
          supersedesPlanId: activePlan.id,
          approvedAt: startedAt,
        },
      });
      await tx.aiPlan.update({ where: { id: activePlan.id }, data: { status: "SUPERSEDED" } });
      await tx.aiApproval.updateMany({
        where: { planId: activePlan.id, status: "PENDING" },
        data: { status: "CANCELLED", decidedAt: startedAt, decisionReason: "A selected-action plan revision replaced the preview" },
      });
    } else {
      executionPlan = await tx.aiPlan.update({
        where: { id: activePlan.id },
        data: { status: "APPROVED", approvedAt: startedAt },
      });
    }

    const approvedExisting = await tx.aiApproval.updateMany({
      where: { planId: executionPlan.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        decidedById: input.actor.id,
        decidedByEmail: input.actor.email,
        decidedAt: startedAt,
        decisionReason: "Explicit confirmation in the assistant review UI",
      },
    });
    if (approvedExisting.count === 0) {
      await tx.aiApproval.create({
        data: {
          runId: run.id,
          planId: executionPlan.id,
          status: "APPROVED",
          scope: "EXECUTE_SELECTED_PLAN_ACTIONS",
          riskLevel: run.riskLevel,
          requiredRole: input.actor.role,
          requestedById: input.actor.id,
          requestedByEmail: input.actor.email,
          requestSnapshot: serializedRedacted({ planHash: selectedHash, actionIds: selectedActionIds }),
          decidedById: input.actor.id,
          decidedByEmail: input.actor.email,
          requestedAt: startedAt,
          decidedAt: startedAt,
          decisionReason: "Explicit confirmation in the assistant review UI",
        },
      });
    }

    const steps = await tx.aiStep.findMany({ where: { runId: run.id } });
    for (const step of steps) {
      const selected = selectedActionIds.includes(step.key);
      await tx.aiStep.update({
        where: { id: step.id },
        data: selected
          ? {
              planId: executionPlan.id,
              status: "RUNNING",
              startedAt,
              attemptCount: { increment: 1 },
            }
          : { status: "SKIPPED", completedAt: startedAt },
      });
      if (selected) {
        await tx.aiToolCall.upsert({
          where: { idempotencyKey: `ai-tool:${run.publicId}:${step.key}:${selectedHash}` },
          create: {
            stepId: step.id,
            sequence: 1,
            toolName: step.toolName ?? step.kind,
            toolSchemaVersion: OPERATION_SCHEMA_VERSION,
            operation: "WRITE",
            status: "RUNNING",
            arguments: step.input,
            riskLevel: step.riskLevel,
            idempotencyKey: `ai-tool:${run.publicId}:${step.key}:${selectedHash}`,
            startedAt,
          },
          update: { status: "RUNNING", startedAt, errorCode: null, errorMessage: null },
        });
      }
    }
    await tx.aiPlan.update({ where: { id: executionPlan.id }, data: { status: "EXECUTING" } });
    return {
      runDbId: run.id,
      runPublicId: run.publicId,
      conversationDbId: run.conversation.id,
      planDbId: executionPlan.id,
      selectedActionIds,
      startedAt,
      alreadyCompleted: false,
    };
  });
}

export async function completeAssistantExecution(
  ledger: ExecutionLedger,
  result: AssistantApplyResult,
): Promise<void> {
  if (ledger.alreadyCompleted) return;
  const completedAt = new Date();
  const durationMs = Math.max(0, completedAt.getTime() - ledger.startedAt.getTime());
  await prisma.$transaction(async (tx) => {
    const persistedRun = await tx.aiRun.findUnique({
      where: { id: ledger.runDbId },
      select: { status: true, usage: true },
    });
    if (!persistedRun) throw new Error("Assistant run no longer exists");
    if (persistedRun.status === "SUCCEEDED") return;
    if (persistedRun.status !== "EXECUTING") {
      throw new Error("Assistant run is no longer eligible for successful completion");
    }
    const priorUsage = parseJsonRecord(persistedRun.usage);
    const claimed = await tx.aiRun.updateMany({
      where: { id: ledger.runDbId, status: "EXECUTING" },
      data: {
        status: "SUCCEEDED",
        resultSummary: result.summary.join("\n"),
        usage: serializedRedacted({
          ...priorUsage,
          execution: {
            durationMs,
            changed: result.insertedCount + result.updatedCount,
          },
        }),
        completedAt,
      },
    });
    if (claimed.count !== 1) {
      const current = await tx.aiRun.findUnique({
        where: { id: ledger.runDbId },
        select: { status: true },
      });
      if (current?.status === "SUCCEEDED") return;
      throw new Error("Assistant run completion could not be claimed");
    }
    await tx.aiToolCall.updateMany({
      where: { step: { runId: ledger.runDbId }, status: "RUNNING" },
      data: {
        status: "SUCCEEDED",
        result: serializedRedacted(result),
        durationMs,
        completedAt,
      },
    });
    await tx.aiStep.updateMany({
      where: { runId: ledger.runDbId, status: "RUNNING" },
      data: { status: "SUCCEEDED", output: serializedRedacted(result.summary), completedAt },
    });
    await tx.aiPlan.update({
      where: { id: ledger.planDbId },
      data: { status: "COMPLETED" },
    });
    await tx.aiMessage.create({
      data: {
        conversationId: ledger.conversationDbId,
        runId: ledger.runDbId,
        role: "ASSISTANT",
        content: result.summary.join("\n") || "اكتمل التنفيذ والتحقق.",
        contentRedacted: redactText(result.summary.join("\n") || "اكتمل التنفيذ والتحقق."),
        metadata: JSON.stringify({ jobId: result.jobId, status: result.status }),
      },
    });
  });
}

export async function failAssistantExecution(
  ledger: ExecutionLedger,
  error: unknown,
): Promise<void> {
  if (ledger.alreadyCompleted) return;
  const completedAt = new Date();
  const errorMessage = redactText(error instanceof Error ? error.message : "Unknown execution error").slice(0, 1000);
  await prisma.$transaction(async (tx) => {
    const run = await tx.aiRun.findUnique({
      where: { id: ledger.runDbId },
      select: { status: true },
    });
    if (!run || run.status === "SUCCEEDED" || run.status === "FAILED") return;
    if (run.status !== "EXECUTING") {
      throw new Error("Assistant run is no longer eligible for failure completion");
    }
    const claimed = await tx.aiRun.updateMany({
      where: { id: ledger.runDbId, status: "EXECUTING" },
      data: { status: "FAILED", errorCode: "EXECUTION_FAILED", errorMessage, completedAt },
    });
    if (claimed.count !== 1) return;
    await tx.aiToolCall.updateMany({
      where: { step: { runId: ledger.runDbId }, status: "RUNNING" },
      data: { status: "FAILED", errorCode: "EXECUTION_FAILED", errorMessage, completedAt },
    });
    await tx.aiStep.updateMany({
      where: { runId: ledger.runDbId, status: "RUNNING" },
      data: { status: "FAILED", errorCode: "EXECUTION_FAILED", errorMessage, completedAt },
    });
    await tx.aiPlan.update({ where: { id: ledger.planDbId }, data: { status: "FAILED" } });
  });
}
