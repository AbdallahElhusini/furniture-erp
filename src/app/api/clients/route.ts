import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireLiveAdminSession } from "@/lib/api-auth";
import { PRIVILEGED_API_ROLES } from "@/lib/roles";
import { CLIENT_STAGES, ClientInputError, clientFinancialSummary, normalizeClientPhone, parseClientInput } from "@/lib/client-crm";
import { auditClientChange } from "@/lib/client-crm-audit";

export async function GET(request: NextRequest) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  try {
    const params = request.nextUrl.searchParams;
    const search = params.get("search")?.trim();
    const stage = params.get("stage");
    if (stage && !CLIENT_STAGES.includes(stage as (typeof CLIENT_STAGES)[number])) return NextResponse.json({ error: "مرحلة العميل غير صحيحة." }, { status: 400 });
    const where: Prisma.ClientWhereInput = {};
    if (stage) where.stage = stage;
    if (params.get("followUp") === "due") {
      const endOfDay = new Date();
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.nextFollowUpAt = { lte: endOfDay };
      if (!stage) where.stage = { not: "LOST" };
    }
    if (search) where.OR = ["name", "company", "phone", "email", "address", "brief", "source"].map((field) => ({ [field]: { contains: search } }));
    const clients = await prisma.client.findMany({ where,
      include: {
        projects: { select: { id: true, title: true, status: true, totalPrice: true, amountPaid: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        _count: { select: { projects: true } },
      }, orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(clients.map((client) => ({ ...client,
      ...clientFinancialSummary(client.projects),
      activeProjectsCount: client.projects.filter((project) => !["COMPLETED", "CANCELLED"].includes(project.status)).length,
    })), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error fetching clients", error);
    return NextResponse.json({ error: "تعذر تحميل العملاء. حاول مرة أخرى." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireLiveAdminSession(request, PRIVILEGED_API_ROLES);
  if (auth.response) return auth.response;
  try {
    const input = parseClientInput(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      if (input.phone) {
        const existing = (await tx.client.findMany({ select: { id: true, name: true, phone: true } })).find((row) => normalizeClientPhone(row.phone) === input.phone);
        if (existing) throw new ClientInputError(`رقم الهاتف مسجل للعميل ${existing.name} (#${existing.id}). افتح سجله بدلاً من إنشاء نسخة أخرى.`);
      }
      const created = await tx.client.create({ data: input, include: { _count: { select: { projects: true } } } });
      await auditClientChange(tx, { actorId: auth.user.id, actorEmail: auth.user.email, recordId: created.id, action: "INSERT", after: created });
      return created;
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ClientInputError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof ClientInputError ? error.message : "صيغة البيانات غير صحيحة." }, { status: 400 });
    console.error("Error creating client", error);
    return NextResponse.json({ error: "تعذر حفظ العميل. لم يتم اعتماد التغيير." }, { status: 500 });
  }
}
