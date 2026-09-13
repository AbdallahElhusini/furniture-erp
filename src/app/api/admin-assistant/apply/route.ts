import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { verifyAssistantPlanToken } from "@/lib/admin-assistant/plan-token";
import { executeAssistantPlan } from "@/lib/admin-assistant/service";
import { OPERATION_CONTRACT_HASH } from "@/lib/admin-assistant/operation-registry";
import {
  beginAssistantExecution,
  completeAssistantExecution,
  failAssistantExecution,
  type ExecutionLedger,
} from "@/lib/admin-assistant/run-ledger";

const ALLOWED_ROLES = ["ADMIN", "MANAGER"] as const;

export async function GET(request: NextRequest) {
  const auth = await requireLiveAdminSession(request, ALLOWED_ROLES);
  if (auth.response) return auth.response;

  const [jobs, runs] = await Promise.all([
    prisma.dataTransferJob.findMany({
      where: { kind: "AI_ASSISTANT" },
      select: {
        id: true,
        status: true,
        rowCount: true,
        insertedCount: true,
        updatedCount: true,
        skippedCount: true,
        errorCount: true,
        actorEmail: true,
        summary: true,
        createdAt: true,
        completedAt: true,
        _count: { select: { changes: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.aiRun.findMany({
      where: { conversation: { actorId: auth.user.id } },
      select: {
        publicId: true,
        status: true,
        mode: true,
        intent: true,
        riskLevel: true,
        requiresApproval: true,
        resultSummary: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
        conversation: { select: { publicId: true, title: true } },
        plans: {
          select: { revision: true, status: true, planHash: true },
          orderBy: { revision: "desc" },
          take: 1,
        },
        _count: { select: { steps: true, approvals: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  return NextResponse.json({ jobs, runs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireLiveAdminSession(request, ALLOWED_ROLES);
  if (auth.response) return auth.response;

  let executionLedger: ExecutionLedger | null = null;
  try {
    const body = (await request.json()) as {
      planToken?: unknown;
      confirmed?: unknown;
      actionIds?: unknown;
      runId?: unknown;
    };
    if (body.confirmed !== true) {
      return NextResponse.json({ error: "يجب تأكيد مراجعة الخطة قبل التنفيذ." }, { status: 400 });
    }
    if (typeof body.planToken !== "string" || !body.planToken) {
      return NextResponse.json({ error: "خطة التنفيذ غير موجودة." }, { status: 400 });
    }
    if (typeof body.runId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(body.runId.trim())) {
      return NextResponse.json(
        { error: "سجل التشغيل غير موجود. أنشئ معاينة جديدة قبل التنفيذ." },
        { status: 400 },
      );
    }
    const actionIds = body.actionIds;
    if (
      !Array.isArray(actionIds)
      || actionIds.length === 0
      || !actionIds.every((id) => typeof id === "string" && id.trim().length > 0)
    ) {
      return NextResponse.json(
        { error: "اختر إجراءً واحدًا على الأقل من خطة المعاينة." },
        { status: 400 },
      );
    }
    if (actionIds.length > 25) {
      return NextResponse.json(
        { error: "عدد الإجراءات المحددة أكبر من الحد المسموح." },
        { status: 400 },
      );
    }
    const requestedActionIds = actionIds as string[];
    const uniqueActionIds = new Set(requestedActionIds);
    if (uniqueActionIds.size !== requestedActionIds.length) {
      return NextResponse.json(
        { error: "قائمة الإجراءات المحددة تحتوي على عناصر مكررة." },
        { status: 400 },
      );
    }

    const plan = verifyAssistantPlanToken(body.planToken, auth.user.id);
    if (!plan) {
      return NextResponse.json(
        { error: "انتهت صلاحية المعاينة أو تغيّرت. أعد فحص الطلب قبل التنفيذ." },
        { status: 409 },
      );
    }
    const planActionIds = new Set(plan.actions.map((action) => action.id));
    if ([...uniqueActionIds].some((id) => !planActionIds.has(id))) {
      return NextResponse.json(
        { error: "أحد الإجراءات المحددة لا ينتمي إلى خطة المعاينة الموقّعة." },
        { status: 400 },
      );
    }
    const selectedPlan = {
      ...plan,
      actions: plan.actions.filter((action) => uniqueActionIds.has(action.id)),
    };
    const actor = {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
    };
    executionLedger = await beginAssistantExecution({
      runPublicId: body.runId.trim(),
      originalPlan: plan,
      selectedPlan,
      actor,
    });
    const result = await executeAssistantPlan(selectedPlan, {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
    });
    await completeAssistantExecution(executionLedger, result);
    return NextResponse.json({
      ...result,
      run: {
        runId: executionLedger.runPublicId,
        status: "SUCCEEDED",
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-HATAB-Operation-Contract": OPERATION_CONTRACT_HASH,
      },
    });
  } catch (error) {
    if (executionLedger) {
      await failAssistantExecution(executionLedger, error).catch((ledgerError) => {
        console.error("Admin assistant execution ledger failed:", ledgerError);
      });
    }
    console.error("Admin assistant apply failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "فشل التنفيذ وتم إلغاء كل تغييرات الخطة.",
      },
      { status: 409 },
    );
  }
}
