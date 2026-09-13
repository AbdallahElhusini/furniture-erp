import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createBackupArtifact } from "@/lib/data-transfer/backup";
import {
  executeTaskCommand,
  parseCreateTaskCommand,
  parseDeleteTaskCommand,
  parseUpdateTaskCommand,
} from "@/lib/task-command-bus";
import { createPrismaTaskCommandRepository } from "@/lib/task-command-prisma";
import { extractAssistantMessage } from "./local-model";
import { inspectNaturalOrderDraft } from "./parser";
import { createAssistantPlanToken } from "./plan-token";
import {
  CURRENT_OPERATION_CONTRACT,
  OPERATION_CONTRACT_HASH,
  OPERATION_CONTRACT_VERSION,
  OPERATION_SCHEMA_VERSION,
} from "./operation-registry";
import { retrieveAssistantContext } from "./retrieval";
import type {
  AddProjectItemPayload,
  AssistantApplyResult,
  AssistantPlan,
  AssistantPlanAction,
  AssistantPreview,
  CreateClientPayload,
  CreateOrderBundlePayload,
  CreateTaskPayload,
  DeleteClientPayload,
  DeleteProjectPayload,
  DeleteTaskPayload,
  ParsedAssistantAction,
  ProjectStatus,
  RemoveProjectItemPayload,
  UpdateClientPayload,
  UpdateProjectItemPayload,
  UpdateProjectPayload,
  UpdateProjectStatusPayload,
  UpdateSupplierOrderStatusPayload,
  UpdateTaskPayload,
} from "./types";

export interface AssistantActor {
  id: number;
  email: string;
  name: string;
  role: string;
}

const PLAN_TTL_MS = 10 * 60 * 1000;

function normalizedPhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value);
}

async function resolveProject(projectRef: string) {
  const numericId = Number.parseInt(projectRef, 10);
  if (Number.isSafeInteger(numericId) && String(numericId) === projectRef.trim()) {
    const project = await prisma.project.findUnique({
      where: { id: numericId },
      select: { id: true, title: true, status: true, clientId: true },
    });
    return { project, ambiguous: false };
  }

  const candidates = await prisma.project.findMany({
    where: { title: { contains: projectRef.trim() } },
    select: { id: true, title: true, status: true, clientId: true },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  return {
    project: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  };
}

async function resolveCatalogItem(sku: string) {
  return prisma.catalogItem.findUnique({
    where: { sku: sku.toUpperCase() },
    select: {
      id: true,
      sku: true,
      nameAr: true,
      costPrice: true,
      sellingPrice: true,
      leadTimeDays: true,
      isActive: true,
      supplierId: true,
      supplier: { select: { id: true, name: true, isActive: true } },
    },
  });
}

async function resolveOrderCatalogItem(reference: string) {
  const cleanReference = reference.trim();
  const bySku = await resolveCatalogItem(cleanReference.replace(/\s+/g, ""));
  if (bySku) return { item: bySku, ambiguous: false };

  const exact = await prisma.catalogItem.findMany({
    where: { OR: [{ nameAr: cleanReference }, { nameEn: cleanReference }] },
    select: {
      id: true,
      sku: true,
      nameAr: true,
      costPrice: true,
      sellingPrice: true,
      leadTimeDays: true,
      isActive: true,
      supplierId: true,
      supplier: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }],
    take: 3,
  });
  if (exact.length === 1) return { item: exact[0], ambiguous: false };
  if (exact.length > 1) return { item: null, ambiguous: true };

  const candidates = await prisma.catalogItem.findMany({
    where: { OR: [{ nameAr: { contains: cleanReference } }, { nameEn: { contains: cleanReference } }] },
    select: {
      id: true,
      sku: true,
      nameAr: true,
      costPrice: true,
      sellingPrice: true,
      leadTimeDays: true,
      isActive: true,
      supplierId: true,
      supplier: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }],
    take: 3,
  });
  return {
    item: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  };
}

function normalizedArabicName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ\s]+/g, "");
}

function supplierQueryVariants(query: string): string[] {
  const clean = query.trim();
  const aliases: Record<string, string> = { ماك: "mac" };
  const alias = aliases[normalizedArabicName(clean)];
  return [...new Set([clean, alias].filter((value): value is string => Boolean(value)))];
}

async function resolveSupplier(query: string) {
  const variants = supplierQueryVariants(query);
  const exact = await prisma.supplier.findFirst({
    where: { name: { in: variants }, isActive: true },
    select: { id: true, name: true },
  });
  if (exact) return { supplier: exact, ambiguous: false };

  const candidates = await prisma.supplier.findMany({
    where: {
      OR: variants.map((variant) => ({ name: { contains: variant } })),
      isActive: true,
    },
    select: { id: true, name: true },
    take: 3,
  });
  return {
    supplier: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  };
}

async function resolveClient(clientRef: string) {
  const reference = clientRef.trim();
  const numericId = Number.parseInt(reference, 10);
  if (Number.isSafeInteger(numericId) && String(numericId) === reference) {
    const client = await prisma.client.findUnique({
      where: { id: numericId },
      include: { _count: { select: { projects: true } } },
    });
    return { client, ambiguous: false };
  }

  const phone = normalizedPhone(reference);
  if (phone.length >= 8) {
    const client = await prisma.client.findFirst({
      where: { phone },
      include: { _count: { select: { projects: true } } },
    });
    if (client) return { client, ambiguous: false };
  }

  const candidates = await prisma.client.findMany({
    where: { OR: [{ name: { contains: reference } }, { company: { contains: reference } }] },
    include: { _count: { select: { projects: true } } },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  return {
    client: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  };
}

function formatCommercialAmount(value: number): string {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(value);
}

async function explainUnparsedSegment(segment: string): Promise<string> {
  const draft = inspectNaturalOrderDraft(segment);
  if (!draft) {
    return `لم أفهم السطر: "${segment}". أعد كتابته بصيغة أوضح أو استخدم الحقول المفصولة بعلامة |.`;
  }

  const understood: string[] = [];
  const required: string[] = [];
  if (draft.clientName) understood.push(`العميل "${draft.clientName}"`);
  else required.push("اسم العميل");
  if (!draft.clientPhone) required.push("رقم هاتف العميل");

  if (draft.productReference) {
    const productResolution = await resolveOrderCatalogItem(draft.productReference);
    if (productResolution.ambiguous) {
      required.push(`كود SKU لأن "${draft.productReference}" يطابق أكثر من منتج`);
    } else if (!productResolution.item) {
      required.push(`إضافة المنتج "${draft.productReference}" للكتالوج أو كتابة كود SKU موجود`);
    } else if (!productResolution.item.isActive) {
      required.push(`تفعيل المنتج ${productResolution.item.sku} أو اختيار منتج نشط`);
    } else {
      understood.push(`المنتج ${productResolution.item.sku}`);
    }
  } else {
    required.push("اسم المنتج أو كود SKU");
  }

  if (draft.quantity === undefined) required.push("كمية المنتج");
  else understood.push(`الكمية ${draft.quantity}`);
  if (draft.unitPrice !== undefined) understood.push(`سعر البيع ${formatCommercialAmount(draft.unitPrice)}`);
  if (draft.unitCost !== undefined) understood.push(`التكلفة ${formatCommercialAmount(draft.unitCost)}`);

  if (draft.supplierQuery) {
    const supplierResolution = await resolveSupplier(draft.supplierQuery);
    if (supplierResolution.ambiguous) {
      required.push(`اسم المورد الكامل لأن "${draft.supplierQuery}" يطابق أكثر من مورد`);
    } else if (!supplierResolution.supplier) {
      required.push(`إضافة المورد "${draft.supplierQuery}" أو كتابة اسمه المسجل`);
    } else {
      understood.push(`المورد "${supplierResolution.supplier.name.trim()}"`);
    }
  }

  for (const field of draft.invalidFields) {
    const label = field === "quantity" ? "كمية صحيحة" : field === "unitPrice" ? "سعر بيع صحيح" : "تكلفة صحيحة";
    if (!required.includes(label)) required.push(label);
  }
  const understoodText = understood.length ? `فهمت ${understood.join("، ")}. ` : "";
  return `${understoodText}لا يمكن تجهيز الخطة بعد؛ المطلوب: ${required.join("؛ ") || "أعد صياغة الطلب"}.`;
}

async function resolveTask(taskRef: string) {
  const reference = taskRef.trim();
  const numericId = Number.parseInt(reference, 10);
  if (Number.isSafeInteger(numericId) && String(numericId) === reference) {
    const task = await prisma.task.findUnique({
      where: { id: numericId },
      include: { project: { select: { title: true } } },
    });
    return { task, ambiguous: false };
  }
  const candidates = await prisma.task.findMany({
    where: { title: { contains: reference } },
    include: { project: { select: { title: true } } },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  return { task: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length > 1 };
}

async function resolveSupplierOrder(orderRef: string) {
  const numericId = Number.parseInt(orderRef.trim(), 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) return null;
  return prisma.supplierOrder.findUnique({
    where: { id: numericId },
    include: {
      supplier: { select: { name: true } },
      project: { select: { title: true } },
    },
  });
}

async function resolveProjectItem(projectRef: string, sku: string) {
  const resolved = await resolveProject(projectRef);
  if (!resolved.project || resolved.ambiguous) return { ...resolved, item: null };
  const catalogItem = await resolveCatalogItem(sku);
  if (!catalogItem) return { ...resolved, item: null };
  const item = await prisma.projectItem.findFirst({
    where: { projectId: resolved.project.id, catalogItemId: catalogItem.id },
    include: {
      catalogItem: { select: { sku: true, nameAr: true } },
      orderItems: {
        include: { supplierOrder: { select: { id: true, status: true } } },
      },
    },
  });
  return { ...resolved, item };
}

function detail(label: string, value: unknown, previousValue?: unknown) {
  return {
    label,
    value: value === null || value === undefined || value === "" ? "—" : String(value),
    ...(previousValue === undefined
      ? {}
      : { previousValue: previousValue === null || previousValue === "" ? "—" : String(previousValue) }),
  };
}

function cleanOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return value.trim();
}

function catalogPayload(
  item: Awaited<ReturnType<typeof resolveCatalogItem>>,
  overrides: { unitCost?: number; unitPrice?: number } = {},
) {
  if (!item) throw new Error("Catalog item is required");
  return {
    id: item.id,
    sku: item.sku,
    nameAr: item.nameAr,
    costPrice: overrides.unitCost ?? item.costPrice,
    sellingPrice: overrides.unitPrice ?? item.sellingPrice,
    leadTimeDays: item.leadTimeDays,
  };
}

async function resolveAction(
  parsed: ParsedAssistantAction,
  warnings: string[],
  blockingIssues: string[],
): Promise<AssistantPlanAction | null> {
  const id = randomUUID();

  if (parsed.kind === "CREATE_CLIENT") {
    const phone = normalizedPhone(parsed.phone);
    if (phone.length < 8) {
      blockingIssues.push(`رقم هاتف العميل ${parsed.name} غير صالح.`);
      return null;
    }
    const existing = await prisma.client.findFirst({ where: { phone } });
    if (existing) {
      warnings.push(`تم تخطي إنشاء العميل ${parsed.name}: الرقم مسجل بالفعل باسم ${existing.name}.`);
      return null;
    }
    const payload: CreateClientPayload = {
      name: parsed.name.trim(),
      phone,
      company: parsed.company?.trim() || undefined,
      notes: parsed.notes?.trim() || undefined,
    };
    return {
      id,
      kind: parsed.kind,
      title: `إنشاء عميل: ${payload.name}`,
      description: `إضافة سجل عميل جديد برقم ${payload.phone}.`,
      risk: "LOW",
      details: [
        detail("الاسم", payload.name),
        detail("الهاتف", payload.phone),
        detail("الشركة", payload.company),
        detail("الملاحظات", payload.notes),
      ],
      payload,
    };
  }

  if (parsed.kind === "CREATE_ORDER_BUNDLE") {
    if (!Number.isSafeInteger(parsed.quantity) || parsed.quantity < 1 || parsed.quantity > 10_000) {
      blockingIssues.push(`كمية المنتج ${parsed.productSku} غير صالحة.`);
      return null;
    }
    for (const [label, amount] of [["سعر البيع", parsed.unitPrice], ["التكلفة", parsed.unitCost]] as const) {
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000)) {
        blockingIssues.push(`${label} للمنتج ${parsed.productSku} غير صالح.`);
        return null;
      }
    }
    if (parsed.estimatedDelivery && Number.isNaN(Date.parse(parsed.estimatedDelivery))) {
      blockingIssues.push(`تاريخ التسليم المتوقع للطلب ${parsed.projectTitle} غير صالح.`);
      return null;
    }
    const phone = normalizedPhone(parsed.clientPhone);
    if (phone.length < 8) {
      blockingIssues.push(`رقم هاتف العميل ${parsed.clientName} غير صالح.`);
      return null;
    }
    const productResolution = await resolveOrderCatalogItem(parsed.productSku);
    if (productResolution.ambiguous) {
      blockingIssues.push(`مرجع المنتج "${parsed.productSku}" يطابق أكثر من منتج. استخدم كود SKU المحدد.`);
      return null;
    }
    const item = productResolution.item;
    if (!item || !item.isActive) {
      blockingIssues.push(`لم يتم العثور على منتج نشط بالاسم أو الكود "${parsed.productSku}". أضفه أو فعّله في الكتالوج أولاً.`);
      return null;
    }
    if (parsed.unitPrice !== undefined || parsed.unitCost !== undefined) {
      warnings.push(`الأسعار المكتوبة ستُطبق على بند المشروع ${item.sku} فقط ولن تغيّر سعر المنتج الأساسي في الكتالوج.`);
    }
    const effectivePrice = parsed.unitPrice ?? item.sellingPrice;
    const effectiveCost = parsed.unitCost ?? item.costPrice;
    if (effectiveCost > effectivePrice) {
      warnings.push(`تكلفة البند ${effectiveCost} أعلى من سعر بيعه ${effectivePrice}. راجع الهامش قبل التنفيذ.`);
    }

    let supplier = item.supplier?.isActive
      ? { id: item.supplier.id, name: item.supplier.name }
      : null;
    if (parsed.supplierQuery) {
      const resolved = await resolveSupplier(parsed.supplierQuery);
      if (resolved.ambiguous) {
        blockingIssues.push(`اسم المصنع "${parsed.supplierQuery}" يطابق أكثر من مورد. استخدم الاسم الكامل.`);
        return null;
      }
      if (!resolved.supplier) {
        blockingIssues.push(`لم يتم العثور على مصنع نشط باسم "${parsed.supplierQuery}".`);
        return null;
      }
      supplier = resolved.supplier;
      if (item.supplierId && item.supplierId !== supplier.id) {
        warnings.push(
          `سيُصنّع هذا الطلب عند ${supplier.name} حسب اختيارك بدلاً من مورد الكتالوج ${item.supplier?.name ?? item.supplierId}. ارتباط المنتج الأساسي لن يتغير.`,
        );
      }
    }
    if (!supplier) {
      warnings.push(`المنتج ${item.sku} بلا مصنع مرتبط؛ سيُضاف للمشروع دون إنشاء أمر توريد.`);
    }

    const client = await prisma.client.findFirst({
      where: { phone },
      select: { id: true, name: true },
    });
    if (client && client.name !== parsed.clientName.trim()) {
      warnings.push(`رقم ${phone} مسجل باسم ${client.name}؛ سيتم استخدام السجل الحالي بدل إنشاء عميل مكرر.`);
    }

    const existingProject = client
      ? await prisma.project.findFirst({
          where: {
            clientId: client.id,
            title: parsed.projectTitle.trim(),
            status: { not: "CANCELLED" },
          },
          select: { id: true, title: true },
        })
      : null;
    if (existingProject) {
      warnings.push(`المشروع "${existingProject.title}" موجود؛ ستُضاف الكمية إلى المشروع نفسه.`);
      if (parsed.unitPrice !== undefined || parsed.unitCost !== undefined) {
        warnings.push(`لأن المشروع موجود، القيم التجارية المكتوبة ستحدّث سعر/تكلفة بند ${item.sku} بالكامل بعد موافقتك.`);
      }
    }

    const payload: CreateOrderBundlePayload = {
      client: {
        existingId: client?.id ?? null,
        name: client?.name ?? parsed.clientName.trim(),
        phone,
        company: parsed.clientCompany?.trim() || undefined,
        email: parsed.clientEmail?.trim() || undefined,
        address: parsed.clientAddress?.trim() || undefined,
        notes: parsed.clientNotes?.trim() || undefined,
      },
      project: {
        existingId: existingProject?.id ?? null,
        title: parsed.projectTitle.trim(),
        priority: parsed.projectPriority ?? "MEDIUM",
        notes: parsed.projectNotes?.trim() || undefined,
        estimatedDelivery: parsed.estimatedDelivery,
      },
      catalogItem: catalogPayload(item, {
        unitCost: parsed.unitCost,
        unitPrice: parsed.unitPrice,
      }),
      quantity: parsed.quantity,
      supplier,
      supplierOverride: Boolean(parsed.supplierQuery),
      itemNotes: parsed.itemNotes?.trim() || undefined,
      commercialOverrides: {
        unitPrice: parsed.unitPrice !== undefined,
        unitCost: parsed.unitCost !== undefined,
      },
    };
    return {
      id,
      kind: parsed.kind,
      title: `طلب ${payload.client.name} · ${item.sku} × ${parsed.quantity}`,
      description: supplier
        ? `إنشاء/تحديث العميل والمشروع، إضافة المنتج، ثم إنشاء أمر توريد مع ${supplier.name}.`
        : "إنشاء/تحديث العميل والمشروع وإضافة المنتج فقط.",
      risk: supplier ? "HIGH" : "MEDIUM",
      details: [
        detail("العميل", payload.client.name),
        detail("الهاتف", payload.client.phone),
        detail("الشركة", payload.client.company),
        detail("البريد", payload.client.email),
        detail("العنوان", payload.client.address),
        detail("الطلب / المشروع", payload.project.title),
        detail("الأولوية", payload.project.priority),
        detail("التسليم المتوقع", payload.project.estimatedDelivery),
        detail("المنتج", `${item.nameAr} · ${item.sku}`),
        detail("الكمية", payload.quantity),
        detail(parsed.unitPrice === undefined ? "سعر الوحدة من الكتالوج" : "سعر البيع المحدد", payload.catalogItem.sellingPrice),
        detail(parsed.unitCost === undefined ? "التكلفة من الكتالوج" : "التكلفة المحددة", payload.catalogItem.costPrice),
        detail("المصنع", supplier?.name),
        detail("ملاحظات البند", payload.itemNotes),
      ],
      payload,
    };
  }

  if (parsed.kind === "UPDATE_PROJECT_STATUS") {
    const resolved = await resolveProject(parsed.projectRef);
    if (resolved.ambiguous) {
      blockingIssues.push(`مرجع المشروع "${parsed.projectRef}" غير محدد ويطابق أكثر من مشروع. استخدم رقم المشروع.`);
      return null;
    }
    if (!resolved.project) {
      blockingIssues.push(`لم يتم العثور على المشروع "${parsed.projectRef}".`);
      return null;
    }
    if (resolved.project.status === parsed.status) {
      warnings.push(`المشروع ${resolved.project.title} في حالة ${parsed.status} بالفعل؛ لا يوجد تغيير.`);
      return null;
    }
    const payload: UpdateProjectStatusPayload = {
      projectId: resolved.project.id,
      title: resolved.project.title,
      fromStatus: resolved.project.status as ProjectStatus,
      toStatus: parsed.status,
    };
    return {
      id,
      kind: parsed.kind,
      title: `تحديث حالة المشروع #${payload.projectId}`,
      description: `${payload.title}: ${payload.fromStatus} ← ${payload.toStatus}`,
      risk: parsed.status === "CANCELLED" ? "HIGH" : "MEDIUM",
      details: [detail("الحالة", payload.toStatus, payload.fromStatus)],
      payload,
    };
  }

  if (parsed.kind === "CREATE_TASK") {
    if (Number.isNaN(Date.parse(parsed.dueDate))) {
      blockingIssues.push(`تاريخ المهمة "${parsed.title}" غير صالح.`);
      return null;
    }
    let projectId: number | null = null;
    let projectTitle: string | null = null;
    if (parsed.projectRef) {
      const resolved = await resolveProject(parsed.projectRef);
      if (resolved.ambiguous) {
        blockingIssues.push(`مرجع المشروع "${parsed.projectRef}" يطابق أكثر من مشروع. استخدم الرقم.`);
        return null;
      }
      if (!resolved.project) {
        blockingIssues.push(`لم يتم العثور على مشروع المهمة "${parsed.projectRef}".`);
        return null;
      }
      projectId = resolved.project.id;
      projectTitle = resolved.project.title;
    }
    const payload: CreateTaskPayload = {
      title: parsed.title.trim(),
      dueDate: parsed.dueDate,
      projectId,
      projectTitle,
      priority: parsed.priority,
      taskType: parsed.taskType,
      description: parsed.description?.trim() || undefined,
    };
    return {
      id,
      kind: parsed.kind,
      title: `إنشاء مهمة: ${payload.title}`,
      description: `${projectTitle ? `${projectTitle} · ` : ""}${new Date(payload.dueDate).toLocaleDateString("ar-EG")} · ${payload.priority}`,
      risk: "LOW",
      details: [
        detail("المهمة", payload.title),
        detail("المشروع", payload.projectTitle),
        detail("الموعد", new Date(payload.dueDate).toLocaleDateString("ar-EG")),
        detail("الأولوية", payload.priority),
        detail("النوع", payload.taskType),
      ],
      payload,
    };
  }

  if (parsed.kind !== "ADD_PROJECT_ITEM") {
    blockingIssues.push("نوع الإجراء غير مدعوم، ولم يتم إنشاء خطة تنفيذ.");
    return null;
  }
  if (!Number.isSafeInteger(parsed.quantity) || parsed.quantity < 1 || parsed.quantity > 10_000) {
    blockingIssues.push(`كمية المنتج ${parsed.productSku} غير صالحة.`);
    return null;
  }
  const resolved = await resolveProject(parsed.projectRef);
  if (resolved.ambiguous) {
    blockingIssues.push(`مرجع المشروع "${parsed.projectRef}" يطابق أكثر من مشروع. استخدم الرقم.`);
    return null;
  }
  if (!resolved.project) {
    blockingIssues.push(`لم يتم العثور على المشروع "${parsed.projectRef}".`);
    return null;
  }
  const item = await resolveCatalogItem(parsed.productSku);
  if (!item || !item.isActive) {
    blockingIssues.push(`لم يتم العثور على منتج نشط بالكود ${parsed.productSku}.`);
    return null;
  }
  const payload: AddProjectItemPayload = {
    projectId: resolved.project.id,
    projectTitle: resolved.project.title,
    catalogItem: catalogPayload(item),
    quantity: parsed.quantity,
    notes: parsed.notes?.trim() || undefined,
  };
  return {
    id,
    kind: parsed.kind,
    title: `إضافة ${item.sku} × ${parsed.quantity}`,
    description: `إضافة الكمية إلى المشروع #${payload.projectId} · ${payload.projectTitle}.`,
    risk: "MEDIUM",
    details: [
      detail("المشروع", `#${payload.projectId} · ${payload.projectTitle}`),
      detail("المنتج", `${item.nameAr} · ${item.sku}`),
      detail("الكمية المضافة", payload.quantity),
      detail("ملاحظات", payload.notes),
    ],
    payload,
  };
}

async function resolveExtendedAction(
  parsed: ParsedAssistantAction,
  warnings: string[],
  blockingIssues: string[],
): Promise<AssistantPlanAction | null> {
  if (
    parsed.kind === "CREATE_CLIENT"
    || parsed.kind === "CREATE_ORDER_BUNDLE"
    || parsed.kind === "UPDATE_PROJECT_STATUS"
    || parsed.kind === "CREATE_TASK"
    || parsed.kind === "ADD_PROJECT_ITEM"
  ) {
    return resolveAction(parsed, warnings, blockingIssues);
  }

  const id = randomUUID();

  if (parsed.kind === "UPDATE_CLIENT") {
    const resolved = await resolveClient(parsed.clientRef);
    if (resolved.ambiguous) {
      blockingIssues.push(`مرجع العميل "${parsed.clientRef}" يطابق أكثر من عميل. استخدم رقم العميل أو الهاتف.`);
      return null;
    }
    if (!resolved.client) {
      blockingIssues.push(`لم يتم العثور على العميل "${parsed.clientRef}".`);
      return null;
    }
    const changes: UpdateClientPayload["changes"] = {};
    if (parsed.name !== undefined) changes.name = parsed.name.trim();
    if (parsed.phone !== undefined) {
      const phone = normalizedPhone(parsed.phone);
      if (phone.length < 8) {
        blockingIssues.push(`رقم الهاتف الجديد للعميل ${resolved.client.name} غير صالح.`);
        return null;
      }
      const conflict = await prisma.client.findFirst({ where: { phone, id: { not: resolved.client.id } } });
      if (conflict) {
        blockingIssues.push(`رقم ${phone} مسجل بالفعل باسم ${conflict.name}.`);
        return null;
      }
      changes.phone = phone;
    }
    if (parsed.company !== undefined) changes.company = cleanOptional(parsed.company) ?? null;
    if (parsed.email !== undefined) changes.email = cleanOptional(parsed.email) ?? null;
    if (parsed.address !== undefined) changes.address = cleanOptional(parsed.address) ?? null;
    if (parsed.notes !== undefined) changes.notes = cleanOptional(parsed.notes) ?? null;
    const before: UpdateClientPayload["before"] = {};
    for (const key of Object.keys(changes)) {
      before[key] = String((resolved.client as unknown as Record<string, unknown>)[key] ?? "") || null;
      if (before[key] === changes[key]) delete changes[key];
    }
    if (Object.keys(changes).length === 0) {
      warnings.push(`بيانات العميل ${resolved.client.name} مطابقة بالفعل؛ لا يوجد تغيير.`);
      return null;
    }
    const payload: UpdateClientPayload = {
      clientId: resolved.client.id,
      clientName: resolved.client.name,
      before: Object.fromEntries(Object.keys(changes).map((key) => [key, before[key] ?? null])),
      changes,
    };
    return {
      id,
      kind: parsed.kind,
      title: `تعديل العميل #${payload.clientId} · ${payload.clientName}`,
      description: `تحديث ${Object.keys(changes).length} حقل بعد التحقق من السجل الحالي.`,
      risk: "MEDIUM",
      details: Object.entries(changes).map(([key, value]) => detail(key, value, payload.before[key])),
      payload,
    };
  }

  if (parsed.kind === "DELETE_CLIENT") {
    const resolved = await resolveClient(parsed.clientRef);
    if (resolved.ambiguous) {
      blockingIssues.push(`مرجع العميل "${parsed.clientRef}" يطابق أكثر من عميل. استخدم الرقم.`);
      return null;
    }
    if (!resolved.client) {
      blockingIssues.push(`لم يتم العثور على العميل "${parsed.clientRef}".`);
      return null;
    }
    if (resolved.client._count.projects > 0) {
      blockingIssues.push(`لا يمكن حذف العميل ${resolved.client.name}: مرتبط بـ ${resolved.client._count.projects} مشروع. ألغِ أو احذف المشاريع أولاً.`);
      return null;
    }
    const payload: DeleteClientPayload = {
      clientId: resolved.client.id,
      clientName: resolved.client.name,
      phone: resolved.client.phone,
      projectCount: resolved.client._count.projects,
    };
    return {
      id,
      kind: parsed.kind,
      title: `حذف العميل #${payload.clientId} · ${payload.clientName}`,
      description: "حذف نهائي لسجل العميل غير المرتبط بمشروعات بعد إنشاء نسخة رجوع.",
      risk: "HIGH",
      details: [detail("الاسم", payload.clientName), detail("الهاتف", payload.phone)],
      payload,
    };
  }

  if (parsed.kind === "UPDATE_PROJECT") {
    const resolved = await resolveProject(parsed.projectRef);
    if (resolved.ambiguous) {
      blockingIssues.push(`مرجع المشروع "${parsed.projectRef}" يطابق أكثر من مشروع. استخدم الرقم.`);
      return null;
    }
    if (!resolved.project) {
      blockingIssues.push(`لم يتم العثور على المشروع "${parsed.projectRef}".`);
      return null;
    }
    const current = await prisma.project.findUnique({ where: { id: resolved.project.id } });
    if (!current) {
      blockingIssues.push(`لم يعد المشروع #${resolved.project.id} موجودًا.`);
      return null;
    }
    if (parsed.estimatedDelivery && Number.isNaN(Date.parse(parsed.estimatedDelivery))) {
      blockingIssues.push(`تاريخ التسليم للمشروع ${current.title} غير صالح.`);
      return null;
    }
    const changes: UpdateProjectPayload["changes"] = {};
    if (parsed.title !== undefined) changes.title = parsed.title.trim();
    if (parsed.status !== undefined) changes.status = parsed.status;
    if (parsed.priority !== undefined) changes.priority = parsed.priority;
    if (parsed.notes !== undefined) changes.notes = cleanOptional(parsed.notes) ?? null;
    if (parsed.estimatedDelivery !== undefined) changes.estimatedDelivery = parsed.estimatedDelivery;
    const before: UpdateProjectPayload["before"] = {};
    for (const key of Object.keys(changes)) {
      const currentValue = key === "estimatedDelivery"
        ? current.estimatedDelivery?.toISOString() ?? null
        : (current as unknown as Record<string, unknown>)[key];
      before[key] = currentValue === undefined || currentValue === null ? null : String(currentValue);
      if (before[key] === changes[key]) delete changes[key];
    }
    if (Object.keys(changes).length === 0) {
      warnings.push(`المشروع ${current.title} يحمل القيم المطلوبة بالفعل.`);
      return null;
    }
    const payload: UpdateProjectPayload = {
      projectId: current.id,
      projectTitle: current.title,
      before: Object.fromEntries(Object.keys(changes).map((key) => [key, before[key] ?? null])),
      changes,
    };
    return {
      id,
      kind: parsed.kind,
      title: `تعديل المشروع #${payload.projectId} · ${payload.projectTitle}`,
      description: `تحديث ${Object.keys(changes).length} حقل في المشروع.`,
      risk: changes.status === "CANCELLED" ? "HIGH" : "MEDIUM",
      details: Object.entries(changes).map(([key, value]) => detail(key, value, payload.before[key])),
      payload,
    };
  }

  if (parsed.kind === "DELETE_PROJECT") {
    const resolved = await resolveProject(parsed.projectRef);
    if (resolved.ambiguous) {
      blockingIssues.push(`مرجع المشروع "${parsed.projectRef}" يطابق أكثر من مشروع. استخدم الرقم.`);
      return null;
    }
    if (!resolved.project) {
      blockingIssues.push(`لم يتم العثور على المشروع "${parsed.projectRef}".`);
      return null;
    }
    const current = await prisma.project.findUnique({
      where: { id: resolved.project.id },
      include: {
        client: { select: { name: true } },
        supplierOrders: { select: { amountPaid: true, _count: { select: { financeEntries: true } } } },
        _count: { select: { items: true, tasks: true, supplierOrders: true, payments: true, financeEntries: true } },
      },
    });
    if (!current) return null;
    if (current.amountPaid !== 0 || current._count.payments > 0 || current._count.financeEntries > 0
      || current.supplierOrders.some((order) => order.amountPaid !== 0 || order._count.financeEntries > 0)) {
      blockingIssues.push(`المشروع #${current.id} مرتبط بحسابات أو مدفوعات. غيّر حالته إلى CANCELLED بدلاً من حذفه للحفاظ على السجل المالي.`);
      return null;
    }
    const payload: DeleteProjectPayload = {
      projectId: current.id,
      projectTitle: current.title,
      clientName: current.client.name,
      itemCount: current._count.items,
      taskCount: current._count.tasks,
      supplierOrderCount: current._count.supplierOrders,
      paymentCount: current._count.payments,
    };
    return {
      id,
      kind: parsed.kind,
      title: `حذف المشروع #${payload.projectId} · ${payload.projectTitle}`,
      description: "حذف نهائي للمشروع وبنوده وأوامر التوريد غير المرتبطة بحركات مالية؛ المهام ستبقى بلا مشروع.",
      risk: "HIGH",
      details: [
        detail("العميل", payload.clientName),
        detail("البنود", payload.itemCount),
        detail("أوامر التوريد", payload.supplierOrderCount),
        detail("المدفوعات", payload.paymentCount),
        detail("المهام التي ستُفصل", payload.taskCount),
      ],
      payload,
    };
  }

  if (parsed.kind === "UPDATE_PROJECT_ITEM" || parsed.kind === "REMOVE_PROJECT_ITEM") {
    const resolved = await resolveProjectItem(parsed.projectRef, parsed.productSku);
    if (resolved.ambiguous) {
      blockingIssues.push(`مرجع المشروع "${parsed.projectRef}" يطابق أكثر من مشروع. استخدم الرقم.`);
      return null;
    }
    if (!resolved.project) {
      blockingIssues.push(`لم يتم العثور على المشروع "${parsed.projectRef}".`);
      return null;
    }
    if (!resolved.item) {
      blockingIssues.push(`المنتج ${parsed.productSku} غير موجود في المشروع #${resolved.project.id}.`);
      return null;
    }
    const protectedOrders = resolved.item.orderItems.filter(({ supplierOrder }) =>
      ["SHIPPED", "DELIVERED"].includes(supplierOrder.status),
    );

    if (parsed.kind === "REMOVE_PROJECT_ITEM") {
      if (protectedOrders.length > 0) {
        blockingIssues.push(`لا يمكن حذف ${parsed.productSku}: البند مرتبط بأمر توريد تم شحنه أو تسليمه.`);
        return null;
      }
      const payload: RemoveProjectItemPayload = {
        itemId: resolved.item.id,
        projectId: resolved.project.id,
        projectTitle: resolved.project.title,
        productSku: resolved.item.catalogItem.sku,
        productName: resolved.item.catalogItem.nameAr,
        quantity: resolved.item.quantity,
        linkedOrderItemCount: resolved.item.orderItems.length,
      };
      return {
        id,
        kind: parsed.kind,
        title: `إزالة ${payload.productSku} من المشروع #${payload.projectId}`,
        description: "إزالة البند وروابط أوامر التوريد النشطة ثم إعادة حساب الإجماليات.",
        risk: "HIGH",
        details: [
          detail("المشروع", payload.projectTitle),
          detail("المنتج", `${payload.productName} · ${payload.productSku}`),
          detail("الكمية الحالية", payload.quantity),
          detail("روابط التوريد", payload.linkedOrderItemCount),
        ],
        payload,
      };
    }

    if (parsed.quantity !== undefined && (!Number.isSafeInteger(parsed.quantity) || parsed.quantity < 1 || parsed.quantity > 10_000)) {
      blockingIssues.push(`الكمية الجديدة للمنتج ${parsed.productSku} غير صالحة.`);
      return null;
    }
    if (parsed.quantity !== undefined && protectedOrders.length > 0) {
      blockingIssues.push(`لا يمكن تعديل كمية ${parsed.productSku}: هناك أمر توريد تم شحنه أو تسليمه.`);
      return null;
    }
    const changes: UpdateProjectItemPayload["changes"] = {};
    if (parsed.quantity !== undefined && parsed.quantity !== resolved.item.quantity) changes.quantity = parsed.quantity;
    if (parsed.status !== undefined && parsed.status !== resolved.item.status) changes.status = parsed.status;
    if (parsed.notes !== undefined && cleanOptional(parsed.notes) !== resolved.item.notes) changes.notes = cleanOptional(parsed.notes) ?? null;
    if (Object.keys(changes).length === 0) {
      warnings.push(`بند ${parsed.productSku} يحمل القيم المطلوبة بالفعل.`);
      return null;
    }
    const payload: UpdateProjectItemPayload = {
      itemId: resolved.item.id,
      projectId: resolved.project.id,
      projectTitle: resolved.project.title,
      productSku: resolved.item.catalogItem.sku,
      productName: resolved.item.catalogItem.nameAr,
      before: {
        quantity: resolved.item.quantity,
        status: resolved.item.status as UpdateProjectItemPayload["before"]["status"],
        notes: resolved.item.notes,
      },
      changes,
      linkedOrderItemCount: resolved.item.orderItems.length,
    };
    return {
      id,
      kind: parsed.kind,
      title: `تعديل ${payload.productSku} في المشروع #${payload.projectId}`,
      description: "تعيين القيم الجديدة للبند وإعادة حساب المشروع وأمر التوريد المرتبط.",
      risk: "MEDIUM",
      details: Object.entries(changes).map(([key, value]) => detail(key, value, payload.before[key as keyof typeof payload.before])),
      payload,
    };
  }

  if (parsed.kind === "UPDATE_TASK" || parsed.kind === "DELETE_TASK") {
    const resolved = await resolveTask(parsed.taskRef);
    if (resolved.ambiguous) {
      blockingIssues.push(`مرجع المهمة "${parsed.taskRef}" يطابق أكثر من مهمة. استخدم الرقم.`);
      return null;
    }
    if (!resolved.task) {
      blockingIssues.push(`لم يتم العثور على المهمة "${parsed.taskRef}".`);
      return null;
    }
    if (parsed.kind === "DELETE_TASK") {
      const payload: DeleteTaskPayload = {
        taskId: resolved.task.id,
        taskTitle: resolved.task.title,
        projectTitle: resolved.task.project?.title ?? null,
      };
      return {
        id,
        kind: parsed.kind,
        title: `حذف المهمة #${payload.taskId} · ${payload.taskTitle}`,
        description: "حذف نهائي للمهمة بعد إنشاء نسخة رجوع.",
        risk: "HIGH",
        details: [detail("المهمة", payload.taskTitle), detail("المشروع", payload.projectTitle)],
        payload,
      };
    }
    if (parsed.dueDate && Number.isNaN(Date.parse(parsed.dueDate))) {
      blockingIssues.push(`التاريخ الجديد للمهمة ${resolved.task.title} غير صالح.`);
      return null;
    }
    const changes: UpdateTaskPayload["changes"] = {};
    if (parsed.title !== undefined) changes.title = parsed.title.trim();
    if (parsed.dueDate !== undefined) changes.dueDate = parsed.dueDate;
    if (parsed.status !== undefined) changes.status = parsed.status;
    if (parsed.priority !== undefined) changes.priority = parsed.priority;
    if (parsed.taskType !== undefined) changes.type = parsed.taskType;
    if (parsed.description !== undefined) changes.description = cleanOptional(parsed.description) ?? null;
    const before: UpdateTaskPayload["before"] = {};
    for (const key of Object.keys(changes)) {
      const currentValue = key === "dueDate"
        ? resolved.task.dueDate.toISOString()
        : (resolved.task as unknown as Record<string, unknown>)[key];
      before[key] = currentValue === null || currentValue === undefined ? null : String(currentValue);
      if (before[key] === changes[key]) delete changes[key];
    }
    if (Object.keys(changes).length === 0) {
      warnings.push(`المهمة ${resolved.task.title} تحمل القيم المطلوبة بالفعل.`);
      return null;
    }
    const payload: UpdateTaskPayload = {
      taskId: resolved.task.id,
      taskTitle: resolved.task.title,
      before: Object.fromEntries(Object.keys(changes).map((key) => [key, before[key] ?? null])),
      changes,
    };
    return {
      id,
      kind: parsed.kind,
      title: `تعديل المهمة #${payload.taskId} · ${payload.taskTitle}`,
      description: `تحديث ${Object.keys(changes).length} حقل في المهمة.`,
      risk: "MEDIUM",
      details: Object.entries(changes).map(([key, value]) => detail(key, value, payload.before[key])),
      payload,
    };
  }

  if (parsed.kind === "UPDATE_SUPPLIER_ORDER_STATUS") {
    const order = await resolveSupplierOrder(parsed.orderRef);
    if (!order) {
      blockingIssues.push(`لم يتم العثور على أمر التوريد #${parsed.orderRef}.`);
      return null;
    }
    if (order.status === parsed.status) {
      warnings.push(`أمر التوريد #${order.id} في حالة ${parsed.status} بالفعل.`);
      return null;
    }
    const payload: UpdateSupplierOrderStatusPayload = {
      orderId: order.id,
      supplierName: order.supplier.name,
      projectTitle: order.project.title,
      fromStatus: order.status as UpdateSupplierOrderStatusPayload["fromStatus"],
      toStatus: parsed.status,
    };
    return {
      id,
      kind: parsed.kind,
      title: `تحديث أمر التوريد #${payload.orderId}`,
      description: `${payload.supplierName} · ${payload.projectTitle}`,
      risk: parsed.status === "CANCELLED" || order.status === "DELIVERED" ? "HIGH" : "MEDIUM",
      details: [detail("الحالة", payload.toStatus, payload.fromStatus)],
      payload,
    };
  }

  blockingIssues.push("نوع الإجراء غير مدعوم، ولم يتم إنشاء خطة تنفيذ.");
  return null;
}

export async function previewAssistantCommand(
  message: string,
  actor: AssistantActor,
): Promise<AssistantPreview> {
  const operationContract = CURRENT_OPERATION_CONTRACT;
  const retrieval = await retrieveAssistantContext(message);
  const parsed = await extractAssistantMessage(message, new Date(), retrieval.modelContext);
  const warnings: string[] = [];
  const blockingIssues = await Promise.all(parsed.unparsed.map(explainUnparsedSegment));
  const actions: AssistantPlanAction[] = [];

  for (const parsedAction of parsed.actions.slice(0, 25)) {
    const action = await resolveExtendedAction(parsedAction, warnings, blockingIssues);
    if (action) actions.push(action);
  }
  if (parsed.actions.length > 25) {
    blockingIssues.push("الحد الأقصى 25 إجراء في المرة الواحدة. قسّم الطلب إلى دفعات أصغر.");
  }
  if (actions.length === 0 && blockingIssues.length === 0) {
    warnings.push("لا توجد تغييرات جديدة قابلة للتطبيق.");
  }

  if (blockingIssues.length > 0 || actions.length === 0) {
    return {
      understood: parsed.actions.length > 0,
      actions,
      warnings,
      blockingIssues,
      planToken: null,
      expiresAt: null,
      operationContract,
      retrieval: { matches: retrieval.matches },
      extractor: parsed.extractor,
    };
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PLAN_TTL_MS);
  const plan: AssistantPlan = {
    version: 2,
    planId: randomUUID(),
    actorId: actor.id,
    actorEmail: actor.email,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    operationContract,
    modelBinding: parsed.extractor.modelBinding,
    actions,
    warnings,
  };
  return {
    understood: true,
    actions,
    warnings,
    blockingIssues,
    planToken: createAssistantPlanToken(plan),
    expiresAt: plan.expiresAt,
    operationContract,
    retrieval: { matches: retrieval.matches },
    extractor: parsed.extractor,
  };
}

async function createAudit(
  tx: Prisma.TransactionClient,
  input: {
    jobId: number;
    actor: AssistantActor;
    module: string;
    recordKey: string;
    action: "INSERT" | "UPDATE" | "DELETE";
    beforeData?: unknown;
    afterData?: unknown;
  },
) {
  await tx.dataChangeAudit.create({
    data: {
      jobId: input.jobId,
      module: input.module,
      recordKey: input.recordKey,
      action: input.action,
      beforeData: input.beforeData === undefined ? null : safeJson(input.beforeData),
      afterData: input.afterData === undefined ? null : safeJson(input.afterData),
      actorId: input.actor.id,
      actorEmail: input.actor.email,
    },
  });
}

async function recalculateProjectTotals(tx: Prisma.TransactionClient, projectId: number) {
  const items = await tx.projectItem.findMany({
    where: { projectId },
    select: { quantity: true, unitCost: true, unitPrice: true },
  });
  return tx.project.update({
    where: { id: projectId },
    data: {
      totalCost: items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
      totalPrice: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    },
  });
}

async function upsertProjectItem(
  tx: Prisma.TransactionClient,
  input: {
    projectId: number;
    catalogItem: AddProjectItemPayload["catalogItem"];
    quantity: number;
    notes?: string;
    overrideUnitCost?: boolean;
    overrideUnitPrice?: boolean;
  },
) {
  const existing = await tx.projectItem.findFirst({
    where: { projectId: input.projectId, catalogItemId: input.catalogItem.id },
  });
  if (existing) {
    const updated = await tx.projectItem.update({
      where: { id: existing.id },
      data: {
        quantity: { increment: input.quantity },
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.overrideUnitCost ? { unitCost: input.catalogItem.costPrice } : {}),
        ...(input.overrideUnitPrice ? { unitPrice: input.catalogItem.sellingPrice } : {}),
      },
    });
    await recalculateProjectTotals(tx, input.projectId);
    return { item: updated, inserted: false, before: existing };
  }
  const created = await tx.projectItem.create({
    data: {
      projectId: input.projectId,
      catalogItemId: input.catalogItem.id,
      quantity: input.quantity,
      unitCost: input.catalogItem.costPrice,
      unitPrice: input.catalogItem.sellingPrice,
      leadTimeDays: input.catalogItem.leadTimeDays,
      notes: input.notes || null,
      status: "PENDING",
    },
  });
  await recalculateProjectTotals(tx, input.projectId);
  return { item: created, inserted: true, before: null };
}

function staleField(current: unknown, expected: string | null): boolean {
  if (current instanceof Date) return current.toISOString() !== expected;
  if (current === null || current === undefined) return expected !== null;
  return String(current) !== expected;
}

async function recalculateSupplierOrderTotal(tx: Prisma.TransactionClient, supplierOrderId: number) {
  const orderItems = await tx.orderItem.findMany({
    where: { supplierOrderId },
    include: { projectItem: { select: { unitCost: true } } },
  });
  return tx.supplierOrder.update({
    where: { id: supplierOrderId },
    data: {
      totalAmount: orderItems.reduce(
        (sum, orderLine) => sum + orderLine.quantity * orderLine.projectItem.unitCost,
        0,
      ),
    },
  });
}

export async function executeAssistantPlan(
  plan: AssistantPlan,
  actor: AssistantActor,
): Promise<AssistantApplyResult> {
  if (
    plan.version !== 2
    || plan.actorId !== actor.id
    || plan.operationContract.schemaVersion !== OPERATION_SCHEMA_VERSION
    || plan.operationContract.contractVersion !== OPERATION_CONTRACT_VERSION
    || plan.operationContract.hash !== OPERATION_CONTRACT_HASH
    || Number.isNaN(Date.parse(plan.expiresAt))
    || Date.parse(plan.expiresAt) <= Date.now()
  ) {
    throw new Error("خطة التنفيذ قديمة أو لا تطابق عقد العمليات الحالي. أنشئ معاينة جديدة.");
  }
  const idempotencyKey = `admin-assistant:${plan.planId}`;
  const existingJob = await prisma.dataTransferJob.findUnique({ where: { idempotencyKey } });
  if (existingJob) {
    if (existingJob.status !== "SUCCESS") {
      throw new Error(
        existingJob.status === "FAILED"
          ? "فشل تنفيذ سابق لهذه الخطة. أنشئ معاينة جديدة قبل المحاولة مرة أخرى."
          : "هذه الخطة قيد التنفيذ بالفعل. انتظر اكتمالها قبل إعادة المحاولة.",
      );
    }
    const parsedSummary = JSON.parse(existingJob.summary || "{}") as { backupFile?: string; actions?: string[] };
    return {
      duplicate: true,
      jobId: existingJob.id,
      status: existingJob.status,
      insertedCount: existingJob.insertedCount,
      updatedCount: existingJob.updatedCount,
      skippedCount: existingJob.skippedCount,
      backupFile: parsedSummary.backupFile ?? null,
      summary: parsedSummary.actions ?? [],
    };
  }

  const backup = await createBackupArtifact({
    scope: "OPERATIONS",
    actor,
    reason: "PRE_ASSISTANT",
  });
  const job = await prisma.dataTransferJob.create({
    data: {
      kind: "AI_ASSISTANT",
      scope: "OPERATIONS",
      idempotencyKey,
      status: "VALIDATING",
      rowCount: plan.actions.length,
      actorId: actor.id,
      actorEmail: actor.email,
      summary: safeJson({
        planId: plan.planId,
        backupFile: backup.fileName,
        actions: plan.actions.map((action) => action.title),
      }),
    },
  });

  let insertedCount = 0;
  let updatedCount = 0;
  const skippedCount = 0;
  const summary: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const taskRepository = createPrismaTaskCommandRepository(tx);
      const taskCommandContext = {
        actor,
        traceId: plan.planId,
        source: "ADMIN_ASSISTANT",
      } as const;
      for (const action of plan.actions) {
        if (action.kind === "CREATE_CLIENT") {
          const payload = action.payload as CreateClientPayload;
          const duplicate = await tx.client.findFirst({ where: { phone: payload.phone } });
          if (duplicate) throw new Error(`تعذر التنفيذ: رقم ${payload.phone} أُضيف بعد المعاينة.`);
          const created = await tx.client.create({
            data: {
              name: payload.name,
              phone: payload.phone,
              company: payload.company || null,
              notes: payload.notes || null,
            },
          });
          insertedCount += 1;
          summary.push(`تم إنشاء العميل #${created.id} ${created.name}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "clients",
            recordKey: String(created.id),
            action: "INSERT",
            afterData: { id: created.id, name: created.name, phone: created.phone },
          });
          continue;
        }

        if (action.kind === "UPDATE_CLIENT") {
          const payload = action.payload as UpdateClientPayload;
          const current = await tx.client.findUnique({ where: { id: payload.clientId } });
          if (!current) throw new Error(`العميل #${payload.clientId} لم يعد موجودًا.`);
          for (const [key, expected] of Object.entries(payload.before)) {
            if (staleField((current as unknown as Record<string, unknown>)[key], expected)) {
              throw new Error(`بيانات العميل #${payload.clientId} تغيّرت بعد المعاينة. أعد المعاينة.`);
            }
          }
          if (payload.changes.phone) {
            const conflict = await tx.client.findFirst({
              where: { phone: payload.changes.phone, id: { not: payload.clientId } },
            });
            if (conflict) throw new Error(`رقم الهاتف الجديد أصبح مستخدمًا بواسطة ${conflict.name}.`);
          }
          const updated = await tx.client.update({
            where: { id: payload.clientId },
            data: payload.changes,
          });
          updatedCount += 1;
          summary.push(`تم تعديل العميل #${updated.id} ${updated.name}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "clients",
            recordKey: String(updated.id),
            action: "UPDATE",
            beforeData: payload.before,
            afterData: payload.changes,
          });
          continue;
        }

        if (action.kind === "DELETE_CLIENT") {
          const payload = action.payload as DeleteClientPayload;
          const current = await tx.client.findUnique({
            where: { id: payload.clientId },
            include: { _count: { select: { projects: true } } },
          });
          if (!current || current.phone !== payload.phone || current._count.projects !== 0) {
            throw new Error(`سجل العميل #${payload.clientId} تغيّر بعد المعاينة. أعد المعاينة.`);
          }
          await tx.client.delete({ where: { id: payload.clientId } });
          updatedCount += 1;
          summary.push(`تم حذف العميل #${payload.clientId} ${payload.clientName}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "clients",
            recordKey: String(payload.clientId),
            action: "DELETE",
            beforeData: current,
          });
          continue;
        }

        if (action.kind === "UPDATE_PROJECT") {
          const payload = action.payload as UpdateProjectPayload;
          const current = await tx.project.findUnique({ where: { id: payload.projectId } });
          if (!current) throw new Error(`المشروع #${payload.projectId} لم يعد موجودًا.`);
          for (const [key, expected] of Object.entries(payload.before)) {
            if (staleField((current as unknown as Record<string, unknown>)[key], expected)) {
              throw new Error(`بيانات المشروع #${payload.projectId} تغيّرت بعد المعاينة. أعد المعاينة.`);
            }
          }
          const changes = { ...payload.changes } as Record<string, unknown>;
          if ("estimatedDelivery" in changes) {
            changes.estimatedDelivery = changes.estimatedDelivery
              ? new Date(String(changes.estimatedDelivery))
              : null;
          }
          const updated = await tx.project.update({
            where: { id: payload.projectId },
            data: changes,
          });
          updatedCount += 1;
          summary.push(`تم تعديل المشروع #${updated.id} ${updated.title}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "projects",
            recordKey: String(updated.id),
            action: "UPDATE",
            beforeData: payload.before,
            afterData: payload.changes,
          });
          continue;
        }

        if (action.kind === "DELETE_PROJECT") {
          const payload = action.payload as DeleteProjectPayload;
          const current = await tx.project.findUnique({
            where: { id: payload.projectId },
            include: {
              supplierOrders: { select: { amountPaid: true, _count: { select: { financeEntries: true } } } },
              _count: { select: { items: true, tasks: true, supplierOrders: true, payments: true, financeEntries: true } },
            },
          });
          if (
            !current
            || current.title !== payload.projectTitle
            || current._count.items !== payload.itemCount
            || current._count.tasks !== payload.taskCount
            || current._count.supplierOrders !== payload.supplierOrderCount
            || current._count.payments !== payload.paymentCount
          ) {
            throw new Error(`المشروع #${payload.projectId} تغيّر بعد المعاينة. أعد المعاينة.`);
          }
          if (current.amountPaid !== 0 || current._count.payments > 0 || current._count.financeEntries > 0
            || current.supplierOrders.some((order) => order.amountPaid !== 0 || order._count.financeEntries > 0)) {
            throw new Error(`المشروع #${payload.projectId} أصبح مرتبطًا بحركات مالية. استخدم حالة CANCELLED بدلاً من الحذف.`);
          }
          await tx.project.delete({ where: { id: payload.projectId } });
          updatedCount += 1;
          summary.push(`تم حذف المشروع #${payload.projectId} ${payload.projectTitle}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "projects",
            recordKey: String(payload.projectId),
            action: "DELETE",
            beforeData: current,
          });
          continue;
        }

        if (action.kind === "UPDATE_PROJECT_ITEM") {
          const payload = action.payload as UpdateProjectItemPayload;
          const current = await tx.projectItem.findUnique({
            where: { id: payload.itemId },
            include: { orderItems: { include: { supplierOrder: true } } },
          });
          if (
            !current
            || current.projectId !== payload.projectId
            || current.quantity !== payload.before.quantity
            || current.status !== payload.before.status
            || current.notes !== payload.before.notes
          ) {
            throw new Error(`بند ${payload.productSku} تغيّر بعد المعاينة. أعد المعاينة.`);
          }
          if (
            payload.changes.quantity !== undefined
            && current.orderItems.some(({ supplierOrder }) => ["SHIPPED", "DELIVERED"].includes(supplierOrder.status))
          ) {
            throw new Error(`لا يمكن تعديل كمية ${payload.productSku} بعد الشحن أو التسليم.`);
          }
          const updated = await tx.projectItem.update({
            where: { id: payload.itemId },
            data: payload.changes,
          });
          if (payload.changes.quantity !== undefined) {
            await tx.orderItem.updateMany({
              where: { projectItemId: payload.itemId },
              data: { quantity: payload.changes.quantity },
            });
            for (const supplierOrderId of new Set(current.orderItems.map((item) => item.supplierOrderId))) {
              await recalculateSupplierOrderTotal(tx, supplierOrderId);
            }
          }
          await recalculateProjectTotals(tx, payload.projectId);
          updatedCount += 1;
          summary.push(`تم تعديل ${payload.productSku} في المشروع #${payload.projectId}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "project_items",
            recordKey: String(updated.id),
            action: "UPDATE",
            beforeData: payload.before,
            afterData: updated,
          });
          continue;
        }

        if (action.kind === "REMOVE_PROJECT_ITEM") {
          const payload = action.payload as RemoveProjectItemPayload;
          const current = await tx.projectItem.findUnique({
            where: { id: payload.itemId },
            include: { orderItems: { include: { supplierOrder: true } } },
          });
          if (
            !current
            || current.projectId !== payload.projectId
            || current.quantity !== payload.quantity
            || current.orderItems.some(({ supplierOrder }) => ["SHIPPED", "DELIVERED"].includes(supplierOrder.status))
          ) {
            throw new Error(`بند ${payload.productSku} تغيّر أو أصبح غير قابل للحذف. أعد المعاينة.`);
          }
          const orderIds = [...new Set(current.orderItems.map((item) => item.supplierOrderId))];
          await tx.orderItem.deleteMany({ where: { projectItemId: payload.itemId } });
          await tx.projectItem.delete({ where: { id: payload.itemId } });
          for (const supplierOrderId of orderIds) await recalculateSupplierOrderTotal(tx, supplierOrderId);
          await recalculateProjectTotals(tx, payload.projectId);
          updatedCount += 1;
          summary.push(`تم حذف ${payload.productSku} من المشروع #${payload.projectId}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "project_items",
            recordKey: String(payload.itemId),
            action: "DELETE",
            beforeData: current,
          });
          continue;
        }

        if (action.kind === "UPDATE_TASK") {
          const payload = action.payload as UpdateTaskPayload;
          const current = await tx.task.findUnique({ where: { id: payload.taskId } });
          if (!current) throw new Error(`المهمة #${payload.taskId} لم تعد موجودة.`);
          for (const [key, expected] of Object.entries(payload.before)) {
            if (staleField((current as unknown as Record<string, unknown>)[key], expected)) {
              throw new Error(`المهمة #${payload.taskId} تغيّرت بعد المعاينة. أعد المعاينة.`);
            }
          }
          const command = parseUpdateTaskCommand(payload.taskId, payload.changes);
          const commandResult = await executeTaskCommand(
            taskRepository,
            command,
            taskCommandContext,
          );
          const updated = commandResult.after;
          if (!updated) throw new Error(`تعذر التحقق من المهمة #${payload.taskId} بعد التعديل.`);
          updatedCount += 1;
          summary.push(`تم تعديل المهمة #${updated.id} ${updated.title}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "tasks",
            recordKey: String(updated.id),
            action: "UPDATE",
            beforeData: payload.before,
            afterData: payload.changes,
          });
          continue;
        }

        if (action.kind === "DELETE_TASK") {
          const payload = action.payload as DeleteTaskPayload;
          const current = await tx.task.findUnique({ where: { id: payload.taskId } });
          if (!current || current.title !== payload.taskTitle) {
            throw new Error(`المهمة #${payload.taskId} تغيّرت بعد المعاينة. أعد المعاينة.`);
          }
          const command = parseDeleteTaskCommand(payload.taskId);
          await executeTaskCommand(taskRepository, command, taskCommandContext);
          updatedCount += 1;
          summary.push(`تم حذف المهمة #${payload.taskId} ${payload.taskTitle}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "tasks",
            recordKey: String(payload.taskId),
            action: "DELETE",
            beforeData: current,
          });
          continue;
        }

        if (action.kind === "UPDATE_SUPPLIER_ORDER_STATUS") {
          const payload = action.payload as UpdateSupplierOrderStatusPayload;
          const current = await tx.supplierOrder.findUnique({ where: { id: payload.orderId } });
          if (!current || current.status !== payload.fromStatus) {
            throw new Error(`أمر التوريد #${payload.orderId} تغيّر بعد المعاينة. أعد المعاينة.`);
          }
          const updated = await tx.supplierOrder.update({
            where: { id: payload.orderId },
            data: {
              status: payload.toStatus,
              ...(payload.toStatus === "DELIVERED" ? { actualDeliveryDate: new Date() } : {}),
            },
          });
          updatedCount += 1;
          summary.push(`تم تحديث أمر التوريد #${updated.id} إلى ${updated.status}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "supplier_orders",
            recordKey: String(updated.id),
            action: "UPDATE",
            beforeData: { status: payload.fromStatus },
            afterData: { status: payload.toStatus },
          });
          continue;
        }

        if (action.kind === "UPDATE_PROJECT_STATUS") {
          const payload = action.payload as UpdateProjectStatusPayload;
          const current = await tx.project.findUnique({ where: { id: payload.projectId } });
          if (!current || current.status !== payload.fromStatus) {
            throw new Error(`حالة المشروع #${payload.projectId} تغيّرت بعد المعاينة. أعد المعاينة.`);
          }
          const updated = await tx.project.update({
            where: { id: payload.projectId },
            data: { status: payload.toStatus },
          });
          updatedCount += 1;
          summary.push(`تم تحديث المشروع #${updated.id} إلى ${updated.status}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "projects",
            recordKey: String(updated.id),
            action: "UPDATE",
            beforeData: { status: current.status },
            afterData: { status: updated.status },
          });
          continue;
        }

        if (action.kind === "CREATE_TASK") {
          const payload = action.payload as CreateTaskPayload;
          const command = parseCreateTaskCommand({
            projectId: payload.projectId,
            technicianId: null,
            type: payload.taskType,
            title: payload.title,
            description: payload.description || null,
            dueDate: payload.dueDate,
            status: "TODO",
            priority: payload.priority,
          });
          const commandResult = await executeTaskCommand(
            taskRepository,
            command,
            taskCommandContext,
          );
          const created = commandResult.after;
          if (!created) throw new Error("تعذر التحقق من المهمة الجديدة بعد الإنشاء.");
          insertedCount += 1;
          summary.push(`تم إنشاء المهمة #${created.id} ${created.title}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "tasks",
            recordKey: String(created.id),
            action: "INSERT",
            afterData: { id: created.id, title: created.title, dueDate: created.dueDate },
          });
          continue;
        }

        if (action.kind === "ADD_PROJECT_ITEM") {
          const payload = action.payload as AddProjectItemPayload;
          const project = await tx.project.findUnique({ where: { id: payload.projectId } });
          const catalogItem = await tx.catalogItem.findUnique({ where: { id: payload.catalogItem.id } });
          if (!project || !catalogItem?.isActive || catalogItem.sku !== payload.catalogItem.sku) {
            throw new Error(`المشروع أو المنتج تغيّر بعد المعاينة. أعد المعاينة.`);
          }
          const result = await upsertProjectItem(tx, payload);
          if (result.inserted) insertedCount += 1;
          else updatedCount += 1;
          summary.push(`تمت إضافة ${payload.catalogItem.sku} × ${payload.quantity} للمشروع #${payload.projectId}.`);
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "project_items",
            recordKey: String(result.item.id),
            action: result.inserted ? "INSERT" : "UPDATE",
            beforeData: result.before,
            afterData: result.item,
          });
          continue;
        }

        if ((action as { kind: string }).kind !== "CREATE_ORDER_BUNDLE") {
          throw new Error("تحتوي الخطة على نوع إجراء غير مدعوم.");
        }
        const payload = action.payload as CreateOrderBundlePayload;
        const catalogItem = await tx.catalogItem.findUnique({
          where: { id: payload.catalogItem.id },
          select: { id: true, sku: true, isActive: true, supplierId: true },
        });
        if (!catalogItem?.isActive || catalogItem.sku !== payload.catalogItem.sku) {
          throw new Error(`المنتج ${payload.catalogItem.sku} تغيّر بعد المعاينة.`);
        }
        if (payload.supplier && catalogItem.supplierId && catalogItem.supplierId !== payload.supplier.id && !payload.supplierOverride) {
          throw new Error(`مورد المنتج ${payload.catalogItem.sku} تغيّر بعد المعاينة.`);
        }

        let client = payload.client.existingId
          ? await tx.client.findUnique({ where: { id: payload.client.existingId } })
          : await tx.client.findFirst({ where: { phone: payload.client.phone } });
        if (client && client.phone !== payload.client.phone) {
          throw new Error("بيانات العميل تغيّرت بعد المعاينة.");
        }
        if (!client) {
          client = await tx.client.create({
            data: {
              name: payload.client.name,
              phone: payload.client.phone,
              company: payload.client.company || null,
              email: payload.client.email || null,
              address: payload.client.address || null,
              notes: payload.client.notes || null,
            },
          });
          insertedCount += 1;
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "clients",
            recordKey: String(client.id),
            action: "INSERT",
            afterData: { id: client.id, name: client.name, phone: client.phone },
          });
        }

        let project = payload.project.existingId
          ? await tx.project.findUnique({ where: { id: payload.project.existingId } })
          : await tx.project.findFirst({
              where: { clientId: client.id, title: payload.project.title, status: { not: "CANCELLED" } },
            });
        if (project && project.clientId !== client.id) {
          throw new Error("المشروع المحدد لم يعد تابعًا للعميل المتوقع.");
        }
        if (!project) {
          project = await tx.project.create({
            data: {
              clientId: client.id,
              title: payload.project.title,
              type: "SIMPLE_ORDER",
              status: "LEAD",
              priority: payload.project.priority,
              notes: payload.project.notes || null,
              estimatedDelivery: payload.project.estimatedDelivery
                ? new Date(payload.project.estimatedDelivery)
                : null,
            },
          });
          insertedCount += 1;
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "projects",
            recordKey: String(project.id),
            action: "INSERT",
            afterData: { id: project.id, title: project.title, clientId: project.clientId },
          });
        }

        const itemResult = await upsertProjectItem(tx, {
          projectId: project.id,
          catalogItem: payload.catalogItem,
          quantity: payload.quantity,
          notes: payload.itemNotes,
          overrideUnitCost: payload.commercialOverrides?.unitCost,
          overrideUnitPrice: payload.commercialOverrides?.unitPrice,
        });
        if (itemResult.inserted) insertedCount += 1;
        else updatedCount += 1;
        await createAudit(tx, {
          jobId: job.id,
          actor,
          module: "project_items",
          recordKey: String(itemResult.item.id),
          action: itemResult.inserted ? "INSERT" : "UPDATE",
          beforeData: itemResult.before,
          afterData: itemResult.item,
        });

        if (payload.supplier) {
          const supplier = await tx.supplier.findUnique({ where: { id: payload.supplier.id } });
          if (!supplier?.isActive) throw new Error(`المورد ${payload.supplier.name} لم يعد نشطًا.`);
          let supplierOrder = await tx.supplierOrder.findFirst({
            where: {
              projectId: project.id,
              supplierId: supplier.id,
              status: { notIn: ["DELIVERED", "SHIPPED", "CANCELLED"] },
            },
            orderBy: { createdAt: "desc" },
          });
          const orderWasCreated = !supplierOrder;
          if (!supplierOrder) {
            const expectedDate = payload.project.estimatedDelivery
              ? new Date(payload.project.estimatedDelivery)
              : new Date();
            if (!payload.project.estimatedDelivery) {
              expectedDate.setDate(expectedDate.getDate() + payload.catalogItem.leadTimeDays);
            }
            supplierOrder = await tx.supplierOrder.create({
              data: {
                supplierId: supplier.id,
                projectId: project.id,
                status: "PENDING",
                expectedDate,
                totalAmount: 0,
                notes: `أمر توريد أنشأه المساعد التنفيذي للمشروع: ${project.title}`,
              },
            });
            insertedCount += 1;
          }
          const orderItem = await tx.orderItem.findFirst({
            where: { supplierOrderId: supplierOrder.id, projectItemId: itemResult.item.id },
          });
          if (orderItem) {
            await tx.orderItem.update({
              where: { id: orderItem.id },
              data: { quantity: { increment: payload.quantity } },
            });
            updatedCount += 1;
          } else {
            await tx.orderItem.create({
              data: {
                supplierOrderId: supplierOrder.id,
                projectItemId: itemResult.item.id,
                quantity: payload.quantity,
              },
            });
            insertedCount += 1;
          }
          const orderItems = await tx.orderItem.findMany({
            where: { supplierOrderId: supplierOrder.id },
            include: { projectItem: { select: { unitCost: true } } },
          });
          await tx.supplierOrder.update({
            where: { id: supplierOrder.id },
            data: {
              totalAmount: orderItems.reduce(
                (sum, orderLine) => sum + orderLine.quantity * orderLine.projectItem.unitCost,
                0,
              ),
            },
          });
          await tx.projectItem.update({
            where: { id: itemResult.item.id },
            data: { status: "ORDERED" },
          });
          if (orderWasCreated) {
            const followupCommand = parseCreateTaskCommand({
              projectId: project.id,
              technicianId: null,
              type: "SUPPLIER_FOLLOWUP",
              title: `متابعة أمر التوريد مع ${supplier.name}`,
              description: `${payload.catalogItem.sku} × ${payload.quantity} · ${project.title}`,
              dueDate: supplierOrder.expectedDate ?? new Date(),
              status: "TODO",
              priority: "HIGH",
            });
            await executeTaskCommand(taskRepository, followupCommand, taskCommandContext);
            insertedCount += 1;
          }
          await createAudit(tx, {
            jobId: job.id,
            actor,
            module: "supplier_orders",
            recordKey: String(supplierOrder.id),
            action: orderWasCreated ? "INSERT" : "UPDATE",
            afterData: {
              id: supplierOrder.id,
              projectId: project.id,
              supplierId: supplier.id,
              sku: payload.catalogItem.sku,
              quantity: payload.quantity,
            },
          });
        }
        summary.push(`تم تجهيز طلب ${client.name}: ${payload.catalogItem.sku} × ${payload.quantity}.`);
      }

      await tx.dataTransferJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCESS",
          insertedCount,
          updatedCount,
          skippedCount,
          completedAt: new Date(),
          summary: safeJson({
            planId: plan.planId,
            backupFile: backup.fileName,
            actions: summary,
          }),
        },
      });
    });

    return {
      duplicate: false,
      jobId: job.id,
      status: "SUCCESS",
      insertedCount,
      updatedCount,
      skippedCount,
      backupFile: backup.fileName,
      summary,
    };
  } catch (error) {
    await prisma.dataTransferJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorCount: 1,
        errors: safeJson([
          {
            code: "ASSISTANT_APPLY_FAILED",
            message: error instanceof Error ? error.message : "Assistant execution failed",
          },
        ]),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
