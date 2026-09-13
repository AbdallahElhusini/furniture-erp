import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { AccountingError, applyPaidDelta, calendarDate, parseLedgerInput, parseLedgerKey, roundMoney, type LedgerKind } from "./validation";

type Actor = { id: number; email: string };
export const ledgerToken = (record: unknown) => createHash("sha256").update(JSON.stringify(record)).digest("hex");

export interface LedgerRow {
  key: string; token: string; kind: LedgerKind; amount: number; method: string; date: string;
  description: string; category: string | null; notes: string | null; projectId: number | null;
  supplierOrderId: number | null; projectTitle: string; party: string; status: string; voidReason: string | null;
}

async function audit(tx: Prisma.TransactionClient, actor: Actor, module: string, recordKey: string, before: unknown, after: unknown) {
  await tx.dataTransferJob.create({
    data: {
      kind: "FINANCE_EDIT", scope: "OPERATIONS", module, status: "SUCCESS", rowCount: 1,
      insertedCount: before ? 0 : 1, updatedCount: before ? 1 : 0,
      actorId: actor.id, actorEmail: actor.email, completedAt: new Date(),
      summary: JSON.stringify({ source: "accounting-workspace", recordKey }),
      changes: { create: { module, recordKey, action: before ? "UPDATE" : "INSERT", beforeData: before ? JSON.stringify(before) : null, afterData: JSON.stringify(after), actorId: actor.id, actorEmail: actor.email } },
    },
  });
}

export async function accountingSnapshot(filters: { from?: string | null; to?: string | null; q?: string | null; kind?: string | null } = {}) {
  const from = filters.from ? calendarDate(filters.from) : null;
  const to = filters.to ? calendarDate(filters.to) : null;
  if (from && to && from > to) throw new AccountingError("تاريخ البداية يجب أن يسبق تاريخ النهاية.");
  return prisma.$transaction(async (tx) => {
    const [payments, entries, projects, orders] = await Promise.all([
      tx.payment.findMany({ include: { project: { include: { client: { select: { name: true } } } } }, orderBy: { date: "desc" } }),
      tx.financeEntry.findMany({ include: { project: { select: { title: true, client: { select: { name: true } } } }, supplierOrder: { select: { supplier: { select: { name: true } } } } }, orderBy: { date: "desc" } }),
      tx.project.findMany({ select: { id: true, title: true, client: { select: { name: true } }, totalPrice: true, totalCost: true, amountPaid: true, status: true }, orderBy: { id: "desc" } }),
      tx.supplierOrder.findMany({ select: { id: true, projectId: true, supplier: { select: { name: true } }, totalAmount: true, amountPaid: true, status: true }, orderBy: { id: "desc" } }),
    ]);
    const rows: LedgerRow[] = [
      ...payments.map(({ project, ...row }): LedgerRow => ({
        key: `payment:${row.id}`, token: ledgerToken(row), kind: "RECEIPT", amount: row.amount, method: row.method,
        date: row.date.toISOString().slice(0, 10), description: "تحصيل من عميل", category: null, notes: row.notes,
        projectId: row.projectId, supplierOrderId: null, projectTitle: project.title, party: project.client.name, status: "POSTED", voidReason: null,
      })),
      ...entries.map(({ project, supplierOrder, ...row }): LedgerRow => ({
        key: `finance:${row.id}`, token: ledgerToken(row), kind: row.kind as LedgerKind, amount: row.amount, method: row.method,
        date: row.date.toISOString().slice(0, 10), description: row.description, category: row.category, notes: row.notes,
        projectId: row.projectId, supplierOrderId: row.supplierOrderId, projectTitle: project?.title ?? "",
        party: supplierOrder?.supplier.name ?? project?.client.name ?? "", status: row.status, voidReason: row.voidReason,
      })),
    ];
    const query = filters.q?.trim().toLocaleLowerCase() ?? "";
    const filtered = rows.filter((row) => (!from || row.date >= from) && (!to || row.date <= to)
      && (!filters.kind || row.kind === filters.kind)
      && (!query || `${row.description} ${row.party} ${row.projectTitle} ${row.notes ?? ""} ${row.category ?? ""}`.toLocaleLowerCase().includes(query)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
    const sum = (values: number[]) => roundMoney(values.reduce((total, value) => total + value, 0));
    const posted = filtered.filter((row) => row.status === "POSTED");
    const cashIn = sum(posted.filter((row) => row.kind === "RECEIPT" || row.kind === "OTHER_INCOME").map((row) => row.amount));
    const cashOut = sum(posted.filter((row) => row.kind === "SUPPLIER_PAYMENT" || row.kind === "EXPENSE").map((row) => row.amount));
    const activeProjects = projects.filter((row) => row.status !== "CANCELLED");
    return {
      rows: filtered,
      summary: { cashIn, cashOut, netCash: roundMoney(cashIn - cashOut),
        customerDue: sum(activeProjects.map((row) => Math.max(0, row.totalPrice - row.amountPaid))),
        supplierDue: sum(orders.map((row) => Math.max(0, row.totalAmount - row.amountPaid))),
        legacyCustomerBalance: roundMoney(sum(projects.map((row) => row.amountPaid)) - sum(payments.map((row) => row.amount))),
        legacySupplierBalance: roundMoney(sum(orders.map((row) => row.amountPaid)) - sum(entries.filter((row) => row.kind === "SUPPLIER_PAYMENT" && row.status === "POSTED").map((row) => row.amount))),
      },
      projects: projects.map(({ client, ...row }) => ({ ...row, clientName: client.name, remaining: roundMoney(row.totalPrice - row.amountPaid) })),
      supplierOrders: orders.map(({ supplier, ...row }) => ({ ...row, supplierName: supplier.name, remaining: roundMoney(row.totalAmount - row.amountPaid) })),
    };
  });
}

export async function createLedgerRecord(raw: unknown, requestKey: unknown, actor: Actor) {
  const input = parseLedgerInput(raw);
  if (typeof requestKey !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) throw new AccountingError("مفتاح الحفظ غير صحيح؛ أعد تحميل الصفحة.");
  const externalKey = `ACCOUNTING-${requestKey}`;
  return prisma.$transaction(async (tx) => {
    const previousJob = await tx.dataTransferJob.findUnique({ where: { idempotencyKey: externalKey } });
    const fingerprint = ledgerToken(input);
    if (previousJob) {
      if (previousJob.sourceHash !== fingerprint) throw new AccountingError("مفتاح الحفظ مستخدم لحركة مختلفة.", 409);
      return { duplicate: true, key: JSON.parse(previousJob.summary).key as string };
    }
    let key: string;
    if (input.kind === "RECEIPT") {
      const project = await tx.project.findUnique({ where: { id: input.projectId! } });
      if (!project) throw new AccountingError("المشروع غير موجود.", 404);
      const receipt = await tx.payment.create({ data: { externalKey, projectId: project.id, amount: input.amount, method: input.method, date: new Date(`${input.date}T12:00:00Z`), notes: input.notes } });
      await tx.project.update({ where: { id: project.id }, data: { amountPaid: applyPaidDelta(project.amountPaid, 0, input.amount) } });
      key = `payment:${receipt.id}`;
      await audit(tx, actor, "payments", key, null, receipt);
    } else {
      let projectId = input.projectId;
      if (input.kind === "SUPPLIER_PAYMENT") {
        const order = await tx.supplierOrder.findUnique({ where: { id: input.supplierOrderId! } });
        if (!order) throw new AccountingError("أمر التوريد غير موجود.", 404);
        if (projectId && projectId !== order.projectId) throw new AccountingError("المشروع لا يطابق أمر التوريد.");
        projectId = order.projectId;
        await tx.supplierOrder.update({ where: { id: order.id }, data: { amountPaid: applyPaidDelta(order.amountPaid, 0, input.amount) } });
      } else if (projectId && !await tx.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
        throw new AccountingError("المشروع غير موجود.", 404);
      }
      const entry = await tx.financeEntry.create({ data: { ...input, externalKey, projectId, date: new Date(`${input.date}T12:00:00Z`) } });
      key = `finance:${entry.id}`;
      await audit(tx, actor, "finance_entries", key, null, entry);
    }
    await tx.dataTransferJob.create({ data: { kind: "FINANCE_EDIT", scope: "OPERATIONS", status: "SUCCESS", sourceHash: fingerprint, idempotencyKey: externalKey, actorId: actor.id, actorEmail: actor.email, summary: JSON.stringify({ key }), completedAt: new Date() } });
    return { duplicate: false, key };
  });
}

export async function editLedgerRecord(key: unknown, token: unknown, raw: unknown, actor: Actor) {
  const parsed = parseLedgerKey(key);
  const input = parseLedgerInput(raw);
  return prisma.$transaction(async (tx) => {
    if (parsed.source === "payment") {
      const before = await tx.payment.findUnique({ where: { id: parsed.id } });
      if (!before) throw new AccountingError("الحركة غير موجودة.", 404);
      if (ledgerToken(before) !== token) throw new AccountingError("تم تعديل الحركة بواسطة مستخدم آخر. حدّث البيانات ثم أعد المحاولة.", 409);
      if (input.kind !== "RECEIPT" || input.projectId !== before.projectId) throw new AccountingError("لا يمكن نقل التحصيل إلى مشروع آخر من خلال تعديل المبلغ.");
      const project = await tx.project.findUniqueOrThrow({ where: { id: before.projectId } });
      const after = await tx.payment.update({ where: { id: before.id }, data: { amount: input.amount, method: input.method, date: new Date(`${input.date}T12:00:00Z`), notes: input.notes } });
      await tx.project.update({ where: { id: project.id }, data: { amountPaid: applyPaidDelta(project.amountPaid, before.amount, after.amount) } });
      await audit(tx, actor, "payments", String(key), before, after);
    } else {
      const before = await tx.financeEntry.findUnique({ where: { id: parsed.id } });
      if (!before) throw new AccountingError("الحركة غير موجودة.", 404);
      if (ledgerToken(before) !== token) throw new AccountingError("تم تعديل الحركة بواسطة مستخدم آخر. حدّث البيانات ثم أعد المحاولة.", 409);
      if (before.status !== "POSTED") throw new AccountingError("الحركة الملغاة لا تقبل التعديل.");
      if (input.kind !== before.kind || input.projectId !== before.projectId || input.supplierOrderId !== before.supplierOrderId) throw new AccountingError("نوع الحركة والمشروع وأمر التوريد لا تتغير بعد التسجيل. ألغِ الحركة ثم أضف حركة صحيحة.");
      const after = await tx.financeEntry.update({ where: { id: before.id }, data: { amount: input.amount, description: input.description, category: input.category, notes: input.notes, method: input.method, date: new Date(`${input.date}T12:00:00Z`), revision: { increment: 1 } } });
      if (before.kind === "SUPPLIER_PAYMENT" && before.supplierOrderId) {
        const order = await tx.supplierOrder.findUniqueOrThrow({ where: { id: before.supplierOrderId } });
        await tx.supplierOrder.update({ where: { id: order.id }, data: { amountPaid: applyPaidDelta(order.amountPaid, before.amount, after.amount) } });
      }
      await audit(tx, actor, "finance_entries", String(key), before, after);
    }
    return { key };
  });
}

export async function voidLedgerRecord(key: unknown, token: unknown, reason: unknown, actor: Actor) {
  const parsed = parseLedgerKey(key);
  if (parsed.source !== "finance") throw new AccountingError("تحصيلات العملاء تعدّل من صف التحصيل؛ لا يمكن حذفها من سجل الحسابات.");
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 500) throw new AccountingError("اكتب سبب إلغاء الحركة (3 إلى 500 حرف).");
  return prisma.$transaction(async (tx) => {
    const before = await tx.financeEntry.findUnique({ where: { id: parsed.id } });
    if (!before) throw new AccountingError("الحركة غير موجودة.", 404);
    if (ledgerToken(before) !== token) throw new AccountingError("تم تعديل الحركة. حدّث البيانات أولًا.", 409);
    if (before.status === "VOID") return { key, duplicate: true };
    if (before.kind === "SUPPLIER_PAYMENT" && before.supplierOrderId) {
      const order = await tx.supplierOrder.findUniqueOrThrow({ where: { id: before.supplierOrderId } });
      await tx.supplierOrder.update({ where: { id: order.id }, data: { amountPaid: applyPaidDelta(order.amountPaid, before.amount, 0) } });
    }
    const after = await tx.financeEntry.update({ where: { id: before.id }, data: { status: "VOID", voidReason: reason.trim(), revision: { increment: 1 } } });
    await audit(tx, actor, "finance_entries", String(key), before, after);
    return { key, duplicate: false };
  });
}
