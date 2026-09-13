import assert from "node:assert/strict";

import { prisma } from "../../src/lib/db.ts";
import {
  beginAssistantExecution,
  beginAssistantPlanning,
  completeAssistantExecution,
  failAssistantExecution,
  failAssistantPlanning,
  finalizeAssistantPreview,
  type AssistantLedgerActor,
} from "../../src/lib/admin-assistant/run-ledger.ts";
import {
  CURRENT_OPERATION_CONTRACT,
  hashCanonicalValue,
} from "../../src/lib/admin-assistant/operation-registry.ts";
import {
  createAssistantPlanToken,
  verifyAssistantPlanToken,
} from "../../src/lib/admin-assistant/plan-token.ts";
import { executeAssistantPlan, previewAssistantCommand } from "../../src/lib/admin-assistant/service.ts";
import { pendingConversationMessages, previewConversation } from "../../src/lib/admin-assistant/conversation-service.ts";
import type {
  AssistantApplyResult,
  AssistantModelBinding,
  AssistantPlan,
  AssistantPlanAction,
  AssistantPreview,
} from "../../src/lib/admin-assistant/types.ts";

const actor: AssistantLedgerActor = {
  id: 701,
  email: "owner@hatab.test",
  name: "Ledger Owner",
  role: "ADMIN",
};
const otherActor: AssistantLedgerActor = {
  id: 702,
  email: "other@hatab.test",
  name: "Other Admin",
  role: "ADMIN",
};

function createTaskAction(id: string, title: string): AssistantPlanAction {
  return {
    id,
    kind: "CREATE_TASK",
    title,
    description: `Create ${title}`,
    risk: "LOW",
    details: [{ label: "Task", value: title }],
    payload: {
      title,
      dueDate: "2026-09-10T09:00:00.000Z",
      projectId: null,
      projectTitle: null,
      priority: "HIGH",
      taskType: "GENERAL",
      description: "Approved lifecycle test",
    },
  };
}

function createClientAction(id: string): AssistantPlanAction {
  return {
    id,
    kind: "CREATE_CLIENT",
    title: "Create client",
    description: "Create the approved client",
    risk: "LOW",
    details: [{ label: "Client", value: "Ledger Client" }],
    payload: {
      name: "Ledger Client",
      phone: "01012345678",
      notes: "Contact owner@hatab.test",
    },
  };
}

function createPlan(
  actions: AssistantPlanAction[],
  suffix: string,
  modelBinding: AssistantModelBinding | null = null,
): AssistantPlan {
  const now = Date.now();
  return {
    version: 2,
    planId: `ledger-plan-${suffix}`,
    actorId: actor.id,
    actorEmail: actor.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    operationContract: CURRENT_OPERATION_CONTRACT,
    modelBinding,
    actions,
    warnings: ["Review before execution"],
  };
}

function createPreview(plan: AssistantPlan): AssistantPreview {
  const localModel = plan.modelBinding;
  return {
    understood: true,
    actions: plan.actions,
    warnings: plan.warnings,
    blockingIssues: [],
    planToken: createAssistantPlanToken(plan),
    expiresAt: plan.expiresAt,
    operationContract: CURRENT_OPERATION_CONTRACT,
    retrieval: { matches: [] },
    extractor: {
      mode: localModel ? "local-model" : "deterministic",
      localModelAvailable: localModel ? true : null,
      model: localModel?.baseModel ?? null,
      latencyMs: null,
      modelBinding: localModel,
    },
  };
}

async function assertRejectedWithoutRunMutation(
  runDbId: number,
  action: () => Promise<unknown>,
  expectedMessage: RegExp,
): Promise<void> {
  await assert.rejects(action, expectedMessage);
  const run = await prisma.aiRun.findUniqueOrThrow({ where: { id: runDbId } });
  assert.equal(run.status, "WAITING_APPROVAL");
  assert.equal(await prisma.aiPlan.count({ where: { runId: runDbId } }), 1);
  assert.equal(await prisma.aiToolCall.count({ where: { step: { runId: runDbId } } }), 0);
}

try {
  const category = await prisma.category.create({ data: { nameAr: "فئة اختبار المحادثة", nameEn: "Chat fixture", slug: `chat-fixture-${Date.now()}` } });
  const supplier = await prisma.supplier.create({ data: { name: "محمود الأبيض اختبار المحادثة", phone: "01055559999" } });
  const defaultSupplier = await prisma.supplier.create({ data: { name: "مورد الكتالوج اختبار المحادثة", phone: "01055559998" } });
  const product = await prisma.catalogItem.create({ data: { categoryId: category.id, supplierId: defaultSupplier.id, nameAr: "مكتب اختبار المحادثة", nameEn: "Chat desk fixture", sku: "CHAT-DESK-TEST", costPrice: 5000, sellingPrice: 10000, isActive: true } });
  const originalCounts = { clients: await prisma.client.count(), projects: await prisma.project.count(), orders: await prisma.supplierOrder.count() };
  const userSource = "كلمنا انهارده عميل احمد اختبار المحادثة طلب مكتب هنعمله عند محود الابيض و هيقف علينا ب 6 و بعته ب 12000";
  const firstLedger = await beginAssistantPlanning({ message: userSource, actor });
  const first = await previewConversation([userSource], actor);
  assert.equal(first.planToken, null);
  assert.equal(first.conversation?.questions[0].field, "unitCost");
  assert.ok(first.conversation?.questions.find((question) => question.field === "productReference"));
  const supplierQuestion = first.conversation?.questions.find((question) => question.field === "supplierQuery");
  assert.ok(supplierQuestion, "typo does not silently select a manufacturer");
  assert.ok(supplierQuestion.suggestions.some((suggestion) => suggestion.message.includes(supplier.name)));
  await finalizeAssistantPreview(firstLedger, first, actor);
  await assert.rejects(() => pendingConversationMessages(firstLedger.conversationPublicId, otherActor.id), /ليست مرتبطة/);
  const secondMessage = "التكلفة: 6000 جنيه";
  const firstContext = await pendingConversationMessages(firstLedger.conversationPublicId, actor.id);
  const secondLedger = await beginAssistantPlanning({ message: secondMessage, actor, conversationPublicId: firstLedger.conversationPublicId });
  const second = await previewConversation([...firstContext, secondMessage], actor);
  assert.equal(second.planToken, null);
  assert.match(second.conversation?.summary ?? "", /6000 جنيه/);
  await finalizeAssistantPreview(secondLedger, second, actor);
  const finalMessage = `هاتف: 01055558888 | الكمية: 1 | المنتج: ${product.sku} | المصنع: ${supplier.name}`;
  const finalContext = await pendingConversationMessages(firstLedger.conversationPublicId, actor.id);
  const finalLedger = await beginAssistantPlanning({ message: finalMessage, actor, conversationPublicId: firstLedger.conversationPublicId });
  const finalPreview = await previewConversation([...finalContext, finalMessage], actor);
  assert.ok(finalPreview.planToken, JSON.stringify(finalPreview.blockingIssues));
  // Reproduces the former production crash: optional undefined payload fields
  // cross the signed JSON boundary before the preview is persisted.
  const persistedOrderPreview = await finalizeAssistantPreview(finalLedger, finalPreview, actor);
  assert.equal(persistedOrderPreview.run?.status, "WAITING_APPROVAL");
  assert.equal(await prisma.client.count(), originalCounts.clients);
  assert.equal(await prisma.project.count(), originalCounts.projects);
  assert.equal(await prisma.supplierOrder.count(), originalCounts.orders);
  const orderPlan = verifyAssistantPlanToken(finalPreview.planToken, actor.id);
  assert.ok(orderPlan);
  const orderExecution = await beginAssistantExecution({ runPublicId: finalLedger.runPublicId, originalPlan: orderPlan, selectedPlan: orderPlan, actor });
  const orderResult = await executeAssistantPlan(orderPlan, actor);
  await completeAssistantExecution(orderExecution, orderResult);
  const newClient = await prisma.client.findFirstOrThrow({ where: { phone: "01055558888" } });
  const newProject = await prisma.project.findFirstOrThrow({ where: { clientId: newClient.id }, include: { items: true, supplierOrders: true } });
  assert.equal(newProject.totalCost, 6000);
  assert.equal(newProject.totalPrice, 12000);
  assert.equal(newProject.items[0].quantity, 1);
  assert.equal(newProject.items[0].unitCost, 6000);
  assert.equal(newProject.supplierOrders[0].supplierId, supplier.id);
  assert.equal(newProject.supplierOrders[0].totalAmount, 6000);
  const unchangedCatalog = await prisma.catalogItem.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(unchangedCatalog.supplierId, defaultSupplier.id);
  assert.equal(unchangedCatalog.costPrice, 5000);
  assert.equal(unchangedCatalog.sellingPrice, 10000);
  assert.deepEqual(await pendingConversationMessages(firstLedger.conversationPublicId, actor.id), []);
  const duplicateOrder = await executeAssistantPlan(orderPlan, actor);
  assert.equal(duplicateOrder.duplicate, true);
  assert.equal(await prisma.project.count(), originalCounts.projects + 1);
  // Money-linked projects must survive both a fresh delete request and a stale
  // previously signed request. Fixtures operate only in the isolated database.
  const deletion = await previewAssistantCommand(`احذف المشروع ${newProject.id}`, actor);
  assert.ok(deletion.planToken, JSON.stringify(deletion.blockingIssues));
  const deletionPlan = verifyAssistantPlanToken(deletion.planToken, actor.id);
  assert.ok(deletionPlan);
  await prisma.project.update({ where: { id: newProject.id }, data: { amountPaid: 100 } });
  const protectedPreview = await previewAssistantCommand(`احذف المشروع ${newProject.id}`, actor);
  assert.equal(protectedPreview.planToken, null);
  assert.match(protectedPreview.blockingIssues.join(" "), /CANCELLED/);
  await assert.rejects(() => executeAssistantPlan(deletionPlan, actor), /حركات مالية/);
  assert.ok(await prisma.project.findUnique({ where: { id: newProject.id } }));
  await prisma.project.update({ where: { id: newProject.id }, data: { amountPaid: 0 } });
  const receipt = await prisma.payment.create({ data: { projectId: newProject.id, amount: 100 } });
  assert.equal((await previewAssistantCommand(`احذف المشروع ${newProject.id}`, actor)).planToken, null);
  await prisma.payment.delete({ where: { id: receipt.id } });
  const expense = await prisma.financeEntry.create({ data: { projectId: newProject.id, kind: "EXPENSE", amount: 50, description: "Isolated finance guard test" } });
  assert.equal((await previewAssistantCommand(`احذف المشروع ${newProject.id}`, actor)).planToken, null);
  await prisma.financeEntry.delete({ where: { id: expense.id } });
  await prisma.supplierOrder.update({ where: { id: newProject.supplierOrders[0].id }, data: { amountPaid: 50 } });
  assert.equal((await previewAssistantCommand(`احذف المشروع ${newProject.id}`, actor)).planToken, null);
  await prisma.supplierOrder.update({ where: { id: newProject.supplierOrders[0].id }, data: { amountPaid: 0 } });
  await prisma.financeEntry.create({ data: { supplierOrderId: newProject.supplierOrders[0].id, kind: "SUPPLIER_PAYMENT", amount: 50, description: "Isolated supplier finance guard test" } });
  assert.equal((await previewAssistantCommand(`احذف المشروع ${newProject.id}`, actor)).planToken, null);
  const actions = [
    createClientAction("client-a"),
    createTaskAction("task-b", "Prepare quotation"),
    createTaskAction("task-c", "Call supplier"),
  ];
  const originalPlan = createPlan(actions, "complete");
  const canonicalPlanToken = createAssistantPlanToken(originalPlan);
  assert.equal(
    verifyAssistantPlanToken(`${canonicalPlanToken}.unsigned-suffix`, actor.id),
    null,
    "a valid token with an unsigned trailing segment must not verify",
  );
  const legacyPlanWithoutBinding = { ...originalPlan } as Partial<AssistantPlan>;
  delete legacyPlanWithoutBinding.modelBinding;
  assert.equal(
    verifyAssistantPlanToken(
      createAssistantPlanToken(legacyPlanWithoutBinding as AssistantPlan),
      actor.id,
    ),
    null,
  );
  const duplicateOriginalPlan: AssistantPlan = {
    ...originalPlan,
    actions: [actions[0], actions[0]],
  };
  assert.equal(
    verifyAssistantPlanToken(createAssistantPlanToken(duplicateOriginalPlan), actor.id),
    null,
  );
  const inconsistentPreviewPlanning = await beginAssistantPlanning({
    message: "Reject a preview that changed after signing",
    actor,
  });
  const inconsistentPreview = createPreview(originalPlan);
  inconsistentPreview.actions = [{
    ...actions[0],
    title: "Mutated after token signing",
  }];
  await assert.rejects(
    () => finalizeAssistantPreview(inconsistentPreviewPlanning, inconsistentPreview, actor),
    /does not match the preview being persisted/,
  );
  assert.equal(
    await prisma.aiPlan.count({ where: { runId: inconsistentPreviewPlanning.runDbId } }),
    0,
  );
  await failAssistantPlanning(
    inconsistentPreviewPlanning,
    new Error("Preview changed after signing"),
  );

  const partialPlanning = await beginAssistantPlanning({
    message: "Create one safe task and then perform an unclear operation",
    actor,
  });
  const partialPreview = createPreview(originalPlan);
  partialPreview.planToken = null;
  partialPreview.expiresAt = null;
  partialPreview.blockingIssues = ["One linked clause needs clarification"];
  const persistedPartialPreview = await finalizeAssistantPreview(partialPlanning, partialPreview, actor);
  assert.equal(persistedPartialPreview.planToken, null);
  assert.equal(persistedPartialPreview.run?.status, "WAITING_INPUT");
  const partialRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: partialPlanning.runDbId },
    include: { plans: true, steps: true, approvals: true },
  });
  assert.equal(partialRun.status, "WAITING_INPUT");
  assert.equal(partialRun.requiresApproval, false);
  assert.deepEqual(partialRun.plans.map((plan) => plan.status), ["DRAFT"]);
  assert.ok(partialRun.steps.every((step) => step.status === "BLOCKED"));
  assert.equal(partialRun.approvals.length, 0);

  const planning = await beginAssistantPlanning({
    message: "Create client 01012345678 and contact owner@hatab.test",
    actor,
  });
  const planningRun = await prisma.aiRun.findUniqueOrThrow({ where: { id: planning.runDbId } });
  assert.equal(planningRun.status, "PLANNING");
  assert.doesNotMatch(planningRun.inputSnapshot, /01012345678|owner@hatab\.test/);
  assert.match(planningRun.inputSnapshot, /REDACTED_PHONE|REDACTED_EMAIL/);

  const persistedPreview = await finalizeAssistantPreview(planning, createPreview(originalPlan), actor);
  assert.equal(persistedPreview.run?.runId, planning.runPublicId);
  assert.equal(persistedPreview.run?.status, "WAITING_APPROVAL");
  assert.equal(persistedPreview.run?.planRevision, 1);
  assert.equal(persistedPreview.run?.planHash, hashCanonicalValue(originalPlan));

  const previewRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: planning.runDbId },
    include: {
      plans: true,
      steps: { orderBy: { sequence: "asc" } },
      approvals: true,
      policyDecisions: true,
      conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });
  assert.equal(previewRun.status, "WAITING_APPROVAL");
  assert.equal(previewRun.plans.length, 1);
  assert.equal(previewRun.plans[0].status, "READY");
  assert.equal(previewRun.plans[0].planHash, hashCanonicalValue(originalPlan));
  assert.deepEqual(previewRun.steps.map((step) => step.key), ["client-a", "task-b", "task-c"]);
  assert.ok(previewRun.steps.every((step) => step.status === "READY" && step.requiresApproval));
  assert.equal(previewRun.approvals.length, 1);
  assert.equal(previewRun.approvals[0].status, "PENDING");
  assert.equal(previewRun.policyDecisions.length, actions.length);
  assert.ok(previewRun.policyDecisions.every((decision) => decision.effect === "REQUIRE_APPROVAL"));
  assert.equal(previewRun.conversation.messages.length, 2);
  assert.doesNotMatch(previewRun.conversation.messages[0].contentRedacted ?? "", /01012345678|owner@hatab\.test/);
  assert.doesNotMatch(previewRun.plans[0].actions, /01012345678|owner@hatab\.test/);

  await assert.rejects(
    () => beginAssistantPlanning({
      message: "Try to reuse a foreign conversation",
      actor: otherActor,
      conversationPublicId: planning.conversationPublicId,
    }),
    /المحادثة غير موجودة/,
  );
  await assertRejectedWithoutRunMutation(
    planning.runDbId,
    () => beginAssistantExecution({
      runPublicId: planning.runPublicId,
      originalPlan,
      selectedPlan: originalPlan,
      actor: otherActor,
    }),
    /لا يخص هذا الحساب/,
  );

  const mutatedSelected: AssistantPlan = {
    ...originalPlan,
    actions: [{
      ...actions[0],
      payload: { ...actions[0].payload, name: "Injected Client" },
    } as AssistantPlanAction],
  };
  await assertRejectedWithoutRunMutation(
    planning.runDbId,
    () => beginAssistantExecution({
      runPublicId: planning.runPublicId,
      originalPlan,
      selectedPlan: mutatedSelected,
      actor,
    }),
    /لا يطابق المعاينة الموقعة/,
  );

  const duplicateSelected: AssistantPlan = {
    ...originalPlan,
    actions: [actions[0], actions[0]],
  };
  await assertRejectedWithoutRunMutation(
    planning.runDbId,
    () => beginAssistantExecution({
      runPublicId: planning.runPublicId,
      originalPlan,
      selectedPlan: duplicateSelected,
      actor,
    }),
    /معرفات إجراءات مكررة/,
  );

  const unknownSelected: AssistantPlan = {
    ...originalPlan,
    actions: [{ ...actions[0], id: "not-in-signed-plan" }],
  };
  await assertRejectedWithoutRunMutation(
    planning.runDbId,
    () => beginAssistantExecution({
      runPublicId: planning.runPublicId,
      originalPlan,
      selectedPlan: unknownSelected,
      actor,
    }),
    /لا يطابق المعاينة الموقعة/,
  );

  const changedContract: AssistantPlan = {
    ...originalPlan,
    operationContract: { ...originalPlan.operationContract, hash: "0".repeat(64) },
  };
  await assertRejectedWithoutRunMutation(
    planning.runDbId,
    () => beginAssistantExecution({
      runPublicId: planning.runPublicId,
      originalPlan,
      selectedPlan: changedContract,
      actor,
    }),
    /بيانات خطة التنفيذ المحددة لا تطابق/,
  );

  const changedOriginal: AssistantPlan = {
    ...originalPlan,
    warnings: ["Tampered after preview"],
  };
  await assertRejectedWithoutRunMutation(
    planning.runDbId,
    () => beginAssistantExecution({
      runPublicId: planning.runPublicId,
      originalPlan: changedOriginal,
      selectedPlan: changedOriginal,
      actor,
    }),
    /لا تطابق المعاينة الموقعة/,
  );

  const reorderedSubset: AssistantPlan = {
    ...originalPlan,
    actions: [actions[1], actions[0]],
  };
  const execution = await beginAssistantExecution({
    runPublicId: planning.runPublicId,
    originalPlan,
    selectedPlan: reorderedSubset,
    actor,
  });
  assert.equal(execution.alreadyCompleted, false);
  assert.deepEqual(execution.selectedActionIds, ["client-a", "task-b"]);

  const executingRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: planning.runDbId },
    include: {
      plans: { orderBy: { revision: "asc" } },
      approvals: { orderBy: { id: "asc" } },
      steps: { orderBy: { sequence: "asc" }, include: { toolCalls: true } },
    },
  });
  assert.equal(executingRun.status, "EXECUTING");
  assert.deepEqual(executingRun.plans.map((plan) => [plan.revision, plan.status]), [
    [1, "SUPERSEDED"],
    [2, "EXECUTING"],
  ]);
  const normalizedSelected: AssistantPlan = { ...originalPlan, actions: [actions[0], actions[1]] };
  assert.equal(executingRun.plans[1].planHash, hashCanonicalValue(normalizedSelected));
  assert.deepEqual(executingRun.approvals.map((approval) => approval.status), ["CANCELLED", "APPROVED"]);
  assert.deepEqual(executingRun.steps.map((step) => step.status), ["RUNNING", "RUNNING", "SKIPPED"]);
  assert.deepEqual(executingRun.steps.map((step) => step.attemptCount), [1, 1, 0]);
  assert.deepEqual(executingRun.steps.map((step) => step.toolCalls.length), [1, 1, 0]);

  const result: AssistantApplyResult = {
    duplicate: false,
    jobId: 9901,
    status: "COMPLETED",
    insertedCount: 2,
    updatedCount: 0,
    skippedCount: 0,
    backupFile: null,
    summary: ["Created two approved records"],
  };
  await completeAssistantExecution(execution, result);

  const completedRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: planning.runDbId },
    include: {
      plans: { orderBy: { revision: "asc" } },
      steps: { orderBy: { sequence: "asc" }, include: { toolCalls: true } },
      outputMessages: true,
    },
  });
  assert.equal(completedRun.status, "SUCCEEDED");
  assert.ok(completedRun.completedAt);
  assert.equal(completedRun.plans[1].status, "COMPLETED");
  const completedUsage = JSON.parse(completedRun.usage) as {
    extractor?: { mode?: string; modelBinding?: unknown };
    operationContract?: { hash?: string };
    execution?: { durationMs?: number; changed?: number };
  };
  assert.equal(completedUsage.extractor?.mode, "deterministic");
  assert.equal(completedUsage.extractor?.modelBinding, null);
  assert.equal(completedUsage.operationContract?.hash, CURRENT_OPERATION_CONTRACT.hash);
  assert.equal(completedUsage.execution?.changed, 2);
  assert.equal(typeof completedUsage.execution?.durationMs, "number");
  assert.deepEqual(completedRun.steps.map((step) => step.status), ["SUCCEEDED", "SUCCEEDED", "SKIPPED"]);
  assert.deepEqual(
    completedRun.steps.flatMap((step) => step.toolCalls).map((toolCall) => toolCall.status),
    ["SUCCEEDED", "SUCCEEDED"],
  );
  assert.ok(completedRun.outputMessages.some((message) => message.content.includes("Created two approved records")));

  const replay = await beginAssistantExecution({
    runPublicId: planning.runPublicId,
    originalPlan,
    selectedPlan: reorderedSubset,
    actor,
  });
  assert.equal(replay.alreadyCompleted, true);
  await completeAssistantExecution(replay, result);
  assert.equal(await prisma.aiPlan.count({ where: { runId: planning.runDbId } }), 2);
  assert.equal(await prisma.aiToolCall.count({ where: { step: { runId: planning.runDbId } } }), 2);

  const recoveryPlan = createPlan(
    [createTaskAction("recover-task", "Recover committed execution")],
    "recovery",
  );
  const recoveryPlanning = await beginAssistantPlanning({
    message: "Recover a committed assistant execution",
    actor,
  });
  await finalizeAssistantPreview(recoveryPlanning, createPreview(recoveryPlan), actor);
  const originalRecoveryExecution = await beginAssistantExecution({
    runPublicId: recoveryPlanning.runPublicId,
    originalPlan: recoveryPlan,
    selectedPlan: recoveryPlan,
    actor,
  });
  await assert.rejects(
    () => beginAssistantExecution({
      runPublicId: recoveryPlanning.runPublicId,
      originalPlan: recoveryPlan,
      selectedPlan: recoveryPlan,
      actor,
    }),
    /قيد التنفيذ بالفعل/,
  );
  assert.equal(
    (await prisma.aiRun.findUniqueOrThrow({ where: { id: recoveryPlanning.runDbId } })).status,
    "EXECUTING",
  );
  const committedRecoveryJob = await prisma.dataTransferJob.create({
    data: {
      kind: "AI_ASSISTANT",
      scope: "OPERATIONS",
      idempotencyKey: `admin-assistant:${recoveryPlan.planId}`,
      status: "SUCCESS",
      rowCount: 1,
      insertedCount: 1,
      actorId: actor.id,
      actorEmail: actor.email,
      completedAt: new Date(),
      summary: JSON.stringify({ actions: ["Recovered one committed action"] }),
    },
  });
  const recoveryExecution = await beginAssistantExecution({
    runPublicId: recoveryPlanning.runPublicId,
    originalPlan: recoveryPlan,
    selectedPlan: recoveryPlan,
    actor,
  });
  assert.equal(recoveryExecution.alreadyCompleted, false);
  assert.equal(recoveryExecution.planDbId, originalRecoveryExecution.planDbId);
  const recoveryResult: AssistantApplyResult = {
    duplicate: true,
    jobId: committedRecoveryJob.id,
    status: "SUCCESS",
    insertedCount: 1,
    updatedCount: 0,
    skippedCount: 0,
    backupFile: null,
    summary: ["Recovered one committed action"],
  };
  await completeAssistantExecution(recoveryExecution, recoveryResult);
  await completeAssistantExecution(originalRecoveryExecution, recoveryResult);
  const recoveredRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: recoveryPlanning.runDbId },
    include: { outputMessages: true, plans: true },
  });
  assert.equal(recoveredRun.status, "SUCCEEDED");
  assert.equal(recoveredRun.plans[0].status, "COMPLETED");
  assert.equal(recoveredRun.outputMessages.length, 2);

  const jobGatePlan = createPlan(
    [createTaskAction("job-gate-task", "Guard idempotent job replay")],
    "job-gate",
  );
  const guardedJob = await prisma.dataTransferJob.create({
    data: {
      kind: "AI_ASSISTANT",
      scope: "OPERATIONS",
      idempotencyKey: `admin-assistant:${jobGatePlan.planId}`,
      status: "VALIDATING",
      rowCount: 1,
      actorId: actor.id,
      actorEmail: actor.email,
    },
  });
  await assert.rejects(
    () => executeAssistantPlan(jobGatePlan, actor),
    /قيد التنفيذ بالفعل/,
  );
  await prisma.dataTransferJob.update({
    where: { id: guardedJob.id },
    data: { status: "FAILED", completedAt: new Date() },
  });
  await assert.rejects(
    () => executeAssistantPlan(jobGatePlan, actor),
    /فشل تنفيذ سابق/,
  );
  await prisma.dataTransferJob.update({
    where: { id: guardedJob.id },
    data: {
      status: "SUCCESS",
      insertedCount: 1,
      summary: JSON.stringify({ actions: ["Replayed only after committed success"] }),
    },
  });
  const guardedReplay = await executeAssistantPlan(jobGatePlan, actor);
  assert.equal(guardedReplay.duplicate, true);
  assert.equal(guardedReplay.status, "SUCCESS");
  assert.deepEqual(guardedReplay.summary, ["Replayed only after committed success"]);

  const failedPlan = createPlan([createTaskAction("fail-task", "Fail safely")], "failure");
  const failurePlanning = await beginAssistantPlanning({ message: "Create a task that will fail", actor });
  await finalizeAssistantPreview(failurePlanning, createPreview(failedPlan), actor);
  const failureExecution = await beginAssistantExecution({
    runPublicId: failurePlanning.runPublicId,
    originalPlan: failedPlan,
    selectedPlan: failedPlan,
    actor,
  });
  await failAssistantExecution(failureExecution, new Error("Factory failed for 01099999999 at fail@hatab.test"));
  const failedRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: failurePlanning.runDbId },
    include: { plans: true, steps: { include: { toolCalls: true } } },
  });
  assert.equal(failedRun.status, "FAILED");
  assert.equal(failedRun.plans[0].status, "FAILED");
  assert.equal(failedRun.steps[0].status, "FAILED");
  assert.equal(failedRun.steps[0].toolCalls[0].status, "FAILED");
  assert.doesNotMatch(failedRun.errorMessage ?? "", /01099999999|fail@hatab\.test/);
  assert.match(failedRun.errorMessage ?? "", /REDACTED_PHONE|REDACTED_EMAIL/);

  const planningFailure = await beginAssistantPlanning({ message: "Planning will fail", actor });
  await failAssistantPlanning(planningFailure, new Error("Bad input from 01088888888 / plan@hatab.test"));
  const failedPlanningRun = await prisma.aiRun.findUniqueOrThrow({ where: { id: planningFailure.runDbId } });
  assert.equal(failedPlanningRun.status, "FAILED");
  assert.equal(failedPlanningRun.errorCode, "PLANNING_FAILED");
  assert.doesNotMatch(failedPlanningRun.errorMessage ?? "", /01088888888|plan@hatab\.test/);

  const invalidContractPlan: AssistantPlan = {
    ...createPlan([createTaskAction("invalid-contract", "Reject bad contract")], "contract"),
    operationContract: { ...CURRENT_OPERATION_CONTRACT, hash: "f".repeat(64) },
  };
  const invalidContractPlanning = await beginAssistantPlanning({ message: "Reject an invalid contract", actor });
  await assert.rejects(
    () => finalizeAssistantPreview(invalidContractPlanning, createPreview(invalidContractPlan), actor),
    /could not be verified/,
  );
  await failAssistantPlanning(invalidContractPlanning, new Error("Signed plan contract mismatch"));
  const invalidContractRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: invalidContractPlanning.runDbId },
  });
  assert.equal(invalidContractRun.status, "FAILED");

  const retiredAt = new Date();
  await prisma.aiModelVersion.updateMany({
    where: { isActive: true },
    data: { isActive: false, status: "RETIRED", retiredAt },
  });
  const modelBinding: AssistantModelBinding = {
    activeModelKey: `ledger-bound-model-${Date.now()}`,
    baseModel: "Qwen/Test-ERP-1.7B",
    baseModelRevision: "6".repeat(40),
    baseModelArtifactSha256: "7".repeat(64),
    modelIdentitySha256: "8".repeat(64),
    adapter: "D:\\hatab-local-ai\\artifacts\\ledger-bound-model",
    adapterModelSha256: "a".repeat(64),
    adapterConfigSha256: "b".repeat(64),
    adapterManifestSha256: "c".repeat(64),
    evaluationReportSha256: "d".repeat(64),
    readinessSemanticSha256: "9".repeat(64),
    promptSha256: "e".repeat(64),
    promotionVerified: true,
  };
  const modelEvidence = JSON.stringify({
    identityHash: modelBinding.modelIdentitySha256,
    baseModelRevision: modelBinding.baseModelRevision,
    baseModelArtifactSha256: modelBinding.baseModelArtifactSha256,
    adapterModelSha256: modelBinding.adapterModelSha256,
    adapterConfigSha256: modelBinding.adapterConfigSha256,
    trainingManifestSha256: modelBinding.adapterManifestSha256,
    evaluationReportSha256: modelBinding.evaluationReportSha256,
    readinessSemanticSha256: modelBinding.readinessSemanticSha256,
    promptSha256: modelBinding.promptSha256,
  });
  const activeModel = await prisma.aiModelVersion.create({
    data: {
      key: modelBinding.activeModelKey,
      displayName: "Ledger bound model",
      provider: "LOCAL",
      baseModel: modelBinding.baseModel,
      adapter: "hatab-local-ai-training-v3",
      runtime: "test-runtime",
      artifactPath: modelBinding.adapter,
      artifactChecksum: modelBinding.adapterModelSha256,
      promptVersion: `sha256:${modelBinding.promptSha256}`,
      toolSchemaVersion: `${CURRENT_OPERATION_CONTRACT.schemaVersion}@${CURRENT_OPERATION_CONTRACT.contractVersion}:${CURRENT_OPERATION_CONTRACT.hash}`,
      evaluationMetrics: modelEvidence,
      status: "ACTIVE",
      isActive: true,
      activatedAt: new Date(),
    },
  });
  const otherModel = await prisma.aiModelVersion.create({
    data: {
      key: `${modelBinding.activeModelKey}-other`,
      displayName: "Different registry model",
      provider: "LOCAL",
      baseModel: "Qwen/Different",
      runtime: "test-runtime",
      artifactPath: "D:\\hatab-local-ai\\artifacts\\other",
      artifactChecksum: "f".repeat(64),
      promptVersion: `sha256:${"1".repeat(64)}`,
      toolSchemaVersion: `${CURRENT_OPERATION_CONTRACT.schemaVersion}@${CURRENT_OPERATION_CONTRACT.contractVersion}:${CURRENT_OPERATION_CONTRACT.hash}`,
      status: "CANARY",
      isActive: false,
    },
  });
  const staleAtFinalizePlan = createPlan(
    [createTaskAction("stale-finalize-task", "Reject a stale extracted model")],
    "stale-at-finalize",
    modelBinding,
  );
  const staleAtFinalizePlanning = await beginAssistantPlanning({
    message: "Reject a preview after the active model changes",
    actor,
  });
  await prisma.$transaction([
    prisma.aiModelVersion.update({
      where: { id: activeModel.id },
      data: { isActive: false, status: "RETIRED", retiredAt: new Date() },
    }),
    prisma.aiModelVersion.update({
      where: { id: otherModel.id },
      data: { isActive: true, status: "ACTIVE", activatedAt: new Date() },
    }),
  ]);
  await assert.rejects(
    () => finalizeAssistantPreview(
      staleAtFinalizePlanning,
      createPreview(staleAtFinalizePlan),
      actor,
    ),
    /لم يعد هو الإصدار النشط الموثّق/,
  );
  const staleAtFinalizeRun = await prisma.aiRun.findUniqueOrThrow({
    where: { id: staleAtFinalizePlanning.runDbId },
  });
  assert.equal(staleAtFinalizeRun.status, "PLANNING");
  assert.equal(await prisma.aiPlan.count({ where: { runId: staleAtFinalizePlanning.runDbId } }), 0);
  await failAssistantPlanning(staleAtFinalizePlanning, new Error("Active model changed before preview persistence"));
  await prisma.$transaction([
    prisma.aiModelVersion.update({
      where: { id: otherModel.id },
      data: { isActive: false, status: "CANARY", activatedAt: null },
    }),
    prisma.aiModelVersion.update({
      where: { id: activeModel.id },
      data: { isActive: true, status: "ACTIVE", retiredAt: null, activatedAt: new Date() },
    }),
  ]);
  const modelPlan = createPlan(
    [createTaskAction("model-bound-task", "Model-bound task")],
    "model-binding",
    modelBinding,
  );
  const modelPlanning = await beginAssistantPlanning({ message: "Create a model-bound task", actor });
  await finalizeAssistantPreview(modelPlanning, createPreview(modelPlan), actor);
  const boundRun = await prisma.aiRun.findUniqueOrThrow({ where: { id: modelPlanning.runDbId } });
  assert.equal(boundRun.modelVersionId, activeModel.id);

  const changedModelSelection: AssistantPlan = {
    ...modelPlan,
    modelBinding: { ...modelBinding, adapterModelSha256: "9".repeat(64) },
  };
  await assertRejectedWithoutRunMutation(
    modelPlanning.runDbId,
    () => beginAssistantExecution({
      runPublicId: modelPlanning.runPublicId,
      originalPlan: modelPlan,
      selectedPlan: changedModelSelection,
      actor,
    }),
    /بيانات خطة التنفيذ المحددة لا تطابق/,
  );

  await prisma.aiRun.update({
    where: { id: modelPlanning.runDbId },
    data: { modelVersionId: otherModel.id },
  });
  await assertRejectedWithoutRunMutation(
    modelPlanning.runDbId,
    () => beginAssistantExecution({
      runPublicId: modelPlanning.runPublicId,
      originalPlan: modelPlan,
      selectedPlan: modelPlan,
      actor,
    }),
    /ارتباط نموذج التشغيل لا يطابق/,
  );
  await prisma.aiRun.update({
    where: { id: modelPlanning.runDbId },
    data: { modelVersionId: activeModel.id },
  });

  await prisma.$transaction([
    prisma.aiModelVersion.update({
      where: { id: activeModel.id },
      data: { isActive: false, status: "RETIRED", retiredAt: new Date() },
    }),
    prisma.aiModelVersion.update({
      where: { id: otherModel.id },
      data: { isActive: true, status: "ACTIVE", activatedAt: new Date() },
    }),
  ]);
  await assertRejectedWithoutRunMutation(
    modelPlanning.runDbId,
    () => beginAssistantExecution({
      runPublicId: modelPlanning.runPublicId,
      originalPlan: modelPlan,
      selectedPlan: modelPlan,
      actor,
    }),
    /لم يعد هو الإصدار النشط الموثّق/,
  );

  console.log(JSON.stringify({
    lifecycle: "passed",
    conversationalOrder: "passed",
    financialDeletionGuards: "passed",
    runId: planning.runPublicId,
    revisionCount: 2,
    completedSteps: 2,
    rejectedTamperCases: 17,
  }));
} finally {
  await prisma.$disconnect();
}
