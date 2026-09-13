import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { PRIVILEGED_API_ROLES } from "@/lib/roles";
import { createLedgerRecord } from "@/lib/accounting/service";
import { AccountingError, calendarDate, parseLedgerKey, roundMoney } from "@/lib/accounting/validation";
import { readBoundedJson, InvalidJsonBodyError, RequestBodyTooLargeError } from "@/lib/public-request-security";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";

function projectIdFrom(value: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) throw new AccountingError("معرّف المشروع غير صحيح.");
  return id;
}

function receiptDate(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) {
    return calendarDate(value.slice(0, 10));
  }
  return calendarDate(value);
}

function failure(error: unknown) {
  if (error instanceof AccountingError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "حجم الطلب أكبر من المسموح." }, { status: 413 });
  if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "بيانات الطلب غير صحيحة." }, { status: 400 });
  console.error("Project payment request failed", error);
  return NextResponse.json({ error: "تعذر إتمام عملية الدفعات. حاول مرة أخرى." }, { status: 500 });
}

export async function GET(request: Request, { params }: Context) {
  try {
    const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
    if (auth.response) return auth.response;
    const projectId = projectIdFrom((await params).id);
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { amountPaid: true } });
      if (!project) throw new AccountingError("المشروع غير موجود.", 404);
      const payments = await tx.payment.findMany({ where: { projectId }, orderBy: { date: "desc" } });
      const recordedPaymentsTotal = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
      return { payments, totalPaid: project.amountPaid, recordedPaymentsTotal, openingBalance: roundMoney(project.amountPaid - recordedPaymentsTotal) };
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
    if (auth.response) return auth.response;
    const projectId = projectIdFrom((await params).id);
    const body = await readBoundedJson(request, 16_384);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccountingError("بيانات الطلب غير صحيحة.");
    const data = body as Record<string, unknown>;
    // Existing API clients may omit a key. The ERP form retains one across
    // retries, so a lost HTTP response cannot create a second receipt.
    const requestKey = data.requestKey ?? request.headers.get("Idempotency-Key") ?? randomUUID();
    const result = await createLedgerRecord({
      kind: "RECEIPT", projectId, amount: data.amount, method: data.method ?? "CASH",
      notes: data.notes ?? null, description: "تحصيل من عميل", date: receiptDate(data.date),
    }, requestKey, auth.user);
    const receiptId = parseLedgerKey(result.key).id;
    const [payment, project] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: receiptId } }),
      prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { totalPrice: true, amountPaid: true } }),
    ]);
    return NextResponse.json({ payment, amountPaid: project.amountPaid, remaining: roundMoney(Math.max(0, project.totalPrice - project.amountPaid)), duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return failure(error); }
}
