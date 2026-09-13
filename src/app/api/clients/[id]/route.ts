import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { PRIVILEGED_API_ROLES } from "@/lib/roles";
import { ClientInputError, clientFinancialSummary, normalizeClientPhone, parseClientInput, type ClientInput } from "@/lib/client-crm";
import { auditClientChange } from "@/lib/client-crm-audit";

type Context = { params: Promise<{ id: string }> };
async function clientId(context: Context) {
  const { id } = await context.params;
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  const id = await clientId(context);
  if (!id) return NextResponse.json({ error: "رقم العميل غير صحيح." }, { status: 400 });
  try {
    const client = await prisma.client.findUnique({ where: { id }, include: { projects: {
      include: { items: { include: { catalogItem: true } }, payments: { orderBy: { date: "desc" } }, _count: { select: { tasks: true, supplierOrders: true } } },
      orderBy: { createdAt: "desc" },
    } } });
    if (!client) return NextResponse.json({ error: "العميل غير موجود." }, { status: 404 });
    return NextResponse.json({ ...client, financialSummary: { totalProjects: client.projects.length, ...clientFinancialSummary(client.projects) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error fetching client", error);
    return NextResponse.json({ error: "تعذر تحميل ملف العميل." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: Context) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  const id = await clientId(context);
  if (!id) return NextResponse.json({ error: "رقم العميل غير صحيح." }, { status: 400 });
  try {
    const body = await request.json();
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({ where: { id } });
      if (!existing) return null;
      if (body && typeof body === "object" && typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt !== existing.updatedAt.toISOString()) return "STALE" as const;
      const input = parseClientInput(body, existing as Partial<ClientInput>);
      if (input.phone) {
        const conflict = (await tx.client.findMany({ where: { id: { not: id } }, select: { id: true, name: true, phone: true } })).find((row) => normalizeClientPhone(row.phone) === input.phone);
        if (conflict) throw new ClientInputError(`رقم الهاتف مسجل للعميل ${conflict.name} (#${conflict.id}).`);
      }
      const updated = await tx.client.update({ where: { id }, data: input });
      await auditClientChange(tx, { actorId: auth.user.id, actorEmail: auth.user.email, recordId: id, action: "UPDATE", before: existing, after: updated });
      return updated;
    });
    if (result === "STALE") return NextResponse.json({ error: "تم تعديل العميل أثناء فتحك للملف. حدّث القائمة وافتح الملف مجدداً." }, { status: 409 });
    if (!result) return NextResponse.json({ error: "العميل غير موجود." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ClientInputError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof ClientInputError ? error.message : "صيغة البيانات غير صحيحة." }, { status: 400 });
    console.error("Error updating client", error);
    return NextResponse.json({ error: "تعذر تحديث العميل. لم يتم اعتماد التغيير." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  const id = await clientId(context);
  if (!id) return NextResponse.json({ error: "رقم العميل غير صحيح." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({ where: { id }, include: { _count: { select: { projects: true } } } });
      if (!existing) return false;
      if (existing._count.projects) throw new ClientInputError("هذا العميل مرتبط بمشاريع. احتفظ بسجله وغيّر مرحلة المتابعة عند الحاجة.");
      await tx.client.delete({ where: { id } });
      await auditClientChange(tx, { actorId: auth.user.id, actorEmail: auth.user.email, recordId: id, action: "DELETE", before: existing });
      return true;
    });
    return result ? NextResponse.json({ success: true }) : NextResponse.json({ error: "العميل غير موجود." }, { status: 404 });
  } catch (error) {
    if (error instanceof ClientInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Error deleting client", error);
    return NextResponse.json({ error: "تعذر حذف العميل. لم يتم اعتماد التغيير." }, { status: 500 });
  }
}
