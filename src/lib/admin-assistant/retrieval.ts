import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AssistantRetrievalKind =
  | "client"
  | "project"
  | "product"
  | "task"
  | "supplier-order"
  | "supplier";

export interface AssistantRetrievalMatch {
  kind: AssistantRetrievalKind;
  ref: string;
  label: string;
}

export interface AssistantRetrievalResult {
  matches: AssistantRetrievalMatch[];
  modelContext: string;
}

const MAX_MESSAGE_CHARACTERS = 8_000;
const MAX_MODEL_CONTEXT_CHARACTERS = 6_000;
const MAX_MATCHES = 24;
const MAX_MATCHES_PER_KIND = 6;
const MAX_SEARCH_TERMS = 10;

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const SEARCH_STOP_WORDS = new Set([
  "add", "address", "all", "and", "change", "client", "company", "customer", "delete",
  "description", "due", "edit", "email", "factory", "from", "item", "name", "notes", "order",
  "phone", "priority", "product", "project", "quantity", "remove", "set", "sku", "status", "supplier",
  "task", "the", "title", "to", "update", "with",
  "اضف", "أضف", "احذف", "أحذف", "الى", "إلى", "العميل", "المشروع", "المنتج", "المورد",
  "الاسم", "البريد", "التليفون", "التلفون", "الهاتف", "اوردر", "أوردر", "بيانات", "تاريخ", "تحديث",
  "تعديل", "تليفون", "تلفون", "حالة", "رقم", "عنوان", "عدد", "عدل", "عميل", "عن", "في", "فى",
  "كود", "كمية", "للمشروع", "ملاحظات", "مصنع", "مشروع", "من", "منتج", "مهمة", "موبايل", "مورد", "طلب",
]);

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
}

function normalizedWord(value: string): string {
  return normalizeDigits(value)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .trim();
}

function uniqueStrings(values: Iterable<string>, limit = Number.POSITIVE_INFINITY): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = value.trim();
    const identity = normalizedWord(clean);
    if (!clean || !identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function scopedIds(message: string, expression: RegExp): number[] {
  const values: number[] = [];
  for (const match of message.matchAll(expression)) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) values.push(parsed);
  }
  return [...new Set(values)].slice(0, 12);
}

function extractSupplierPhrases(message: string): string[] {
  const phrases: string[] = [];
  const expression = /(?:مصنع|مورد|factory|supplier)\s*(?:اسمه|name)?\s*[:=]?\s*([^|،,;.؛\n]{2,80})/giu;
  for (const match of message.matchAll(expression)) {
    const phrase = match[1]
      .replace(/\s+(?:ومشروع|والمشروع|ومنتج|والمنتج|project|product|order|task)\b.*$/iu, "")
      .trim();
    if (phrase) phrases.push(phrase);
  }
  return uniqueStrings(phrases, 6);
}

function phoneVariants(value: string): string[] {
  const normalized = value.replace(/[^\d+]/g, "").replace(/^0020/, "+20");
  const variants = [normalized];
  if (normalized.startsWith("+20") && normalized.length > 3) {
    variants.push(`0${normalized.slice(3)}`);
  } else if (/^01[0125]\d{8}$/.test(normalized)) {
    variants.push(`+20${normalized.slice(1)}`);
  }
  return variants;
}

function meaningfulTerms(message: string, supplierPhrases: string[]): string[] {
  const withoutStructuredValues = normalizeDigits(message)
    .replace(/\b[A-Z]{2,10}(?:-[A-Z0-9]{2,})+\b/giu, " ")
    .replace(/(?:\+?20|0020|0)?1[0125][\d\s-]{8,12}/g, " ")
    .replace(/\d+/g, " ");
  const quoted = [...withoutStructuredValues.matchAll(/["“”']([^"“”']{2,80})["“”']/gu)]
    .map((match) => match[1]);
  const words = withoutStructuredValues.match(/[\p{L}][\p{L}.'_-]{1,48}/gu) ?? [];
  const candidates = [
    ...supplierPhrases,
    ...quoted,
    ...words.filter((word) => {
      const normalized = normalizedWord(word).replace(/[.'_-]/g, "");
      return normalized.length >= 3 && !SEARCH_STOP_WORDS.has(normalized);
    }),
  ];
  return uniqueStrings(candidates, MAX_SEARCH_TERMS);
}

function safeDisplay(value: string | null | undefined, maxLength = 120): string {
  return (value ?? "")
    .replace(/[|\r\n\0]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

function mergeRecords<T>(
  first: readonly T[],
  second: readonly T[],
  identity: (value: T) => string | number,
  limit = MAX_MATCHES_PER_KIND,
): T[] {
  const result: T[] = [];
  const seen = new Set<string | number>();
  for (const value of [...first, ...second]) {
    const key = identity(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function buildModelContext(matches: AssistantRetrievalMatch[]): string {
  if (matches.length === 0) return "";
  const header = [
    "LIVE ERP REFERENCE MATCHES (read-only, may be stale):",
    "Use these records only to understand which employee-supplied reference is likely intended.",
    "Never copy a value that is absent from the employee message and never infer an action from this context alone.",
  ];
  const lines = [...header];
  let length = header.join("\n").length;
  for (const match of matches) {
    const line = `- kind=${match.kind}; ref=${safeDisplay(match.ref, 80)}; display=${safeDisplay(match.label, 240)}`;
    if (length + line.length + 1 > MAX_MODEL_CONTEXT_CHARACTERS) break;
    lines.push(line);
    length += line.length + 1;
  }
  return lines.join("\n");
}

export async function retrieveAssistantContext(rawMessage: string): Promise<AssistantRetrievalResult> {
  const message = normalizeDigits(rawMessage.slice(0, MAX_MESSAGE_CHARACTERS));
  const clientIds = scopedIds(
    message,
    /(?:العميل|عميل|client|customer)\s*(?:رقم|id|#)?\s*[:=#-]?\s*(\d+)\b/giu,
  );
  const projectIds = scopedIds(
    message,
    /(?:المشروع|مشروع|project)\s*(?:رقم|id|#)?\s*[:=#-]?\s*(\d+)\b/giu,
  );
  const taskIds = scopedIds(
    message,
    /(?:المهمة|مهمة|task)\s*(?:رقم|id|#)?\s*[:=#-]?\s*(\d+)\b/giu,
  );
  const supplierOrderIds = scopedIds(
    message,
    /(?:أمر\s+توريد|امر\s+توريد|supplier\s+order|purchase\s+order|po)\s*(?:رقم|id|#)?\s*[:=#-]?\s*(\d+)\b/giu,
  );
  const phones = uniqueStrings(
    [...message.matchAll(/(?:\+?20|0020|0)?1[0125][\d\s-]{8,12}/g)]
      .flatMap((match) => phoneVariants(match[0])),
    8,
  );
  const skus = uniqueStrings(
    [...message.toUpperCase().matchAll(/\b[A-Z]{2,10}(?:-[A-Z0-9]{2,})+\b/g)].map((match) => match[0]),
    12,
  );
  const supplierPhrases = extractSupplierPhrases(message);
  const searchTerms = meaningfulTerms(message, supplierPhrases);

  const clientFilters: Prisma.ClientWhereInput[] = [];
  if (clientIds.length) clientFilters.push({ id: { in: clientIds } });
  if (phones.length) clientFilters.push({ phone: { in: phones } });
  for (const term of searchTerms) {
    clientFilters.push({ name: { contains: term } }, { company: { contains: term } });
  }

  const projectFilters: Prisma.ProjectWhereInput[] = [];
  if (projectIds.length) projectFilters.push({ id: { in: projectIds } });
  for (const term of searchTerms) projectFilters.push({ title: { contains: term } });

  const taskFilters: Prisma.TaskWhereInput[] = [];
  if (taskIds.length) taskFilters.push({ id: { in: taskIds } });
  for (const term of searchTerms) taskFilters.push({ title: { contains: term } });

  const productFilters: Prisma.CatalogItemWhereInput[] = [];
  if (skus.length) productFilters.push({ sku: { in: skus } });
  for (const term of searchTerms) {
    productFilters.push({ nameAr: { contains: term } }, { nameEn: { contains: term } });
  }

  const supplierFilters: Prisma.SupplierWhereInput[] = [];
  for (const phrase of supplierPhrases) supplierFilters.push({ name: { contains: phrase } });
  for (const term of searchTerms) {
    supplierFilters.push({ name: { contains: term } });
    if (normalizedWord(term) === "ماك") supplierFilters.push({ name: { contains: "mac" } });
  }

  const [clients, projects, tasks, products, suppliers] = await Promise.all([
    clientFilters.length
      ? prisma.client.findMany({
          where: { OR: clientFilters },
          select: { id: true, name: true, company: true },
          orderBy: { updatedAt: "desc" },
          take: MAX_MATCHES_PER_KIND,
        })
      : [],
    projectFilters.length
      ? prisma.project.findMany({
          where: { OR: projectFilters },
          select: {
            id: true, title: true, status: true, priority: true,
            client: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: MAX_MATCHES_PER_KIND,
        })
      : [],
    taskFilters.length
      ? prisma.task.findMany({
          where: { OR: taskFilters },
          select: {
            id: true, title: true, status: true, priority: true,
            project: { select: { title: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: MAX_MATCHES_PER_KIND,
        })
      : [],
    productFilters.length
      ? prisma.catalogItem.findMany({
          where: { isActive: true, OR: productFilters },
          select: { id: true, sku: true, nameAr: true, nameEn: true, isActive: true },
          orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }],
          take: MAX_MATCHES_PER_KIND,
        })
      : [],
    supplierFilters.length
      ? prisma.supplier.findMany({
          where: { OR: supplierFilters },
          select: { id: true, name: true, isActive: true },
          orderBy: { updatedAt: "desc" },
          take: MAX_MATCHES_PER_KIND,
        })
      : [],
  ]);

  // Exact references must never be displaced by newer fuzzy matches at the query limit.
  const [exactClients, exactProjects, exactTasks, exactProducts, exactSuppliers] = await Promise.all([
    clientIds.length || phones.length
      ? prisma.client.findMany({
          where: {
            OR: [
              ...(clientIds.length ? [{ id: { in: clientIds } }] : []),
              ...(phones.length ? [{ phone: { in: phones } }] : []),
            ],
          },
          select: { id: true, name: true, company: true },
          take: 12,
        })
      : [],
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true, title: true, status: true, priority: true,
            client: { select: { name: true } },
          },
          take: 12,
        })
      : [],
    taskIds.length
      ? prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: {
            id: true, title: true, status: true, priority: true,
            project: { select: { title: true } },
          },
          take: 12,
        })
      : [],
    skus.length
      ? prisma.catalogItem.findMany({
          where: { sku: { in: skus } },
          select: { id: true, sku: true, nameAr: true, nameEn: true, isActive: true },
          take: 12,
        })
      : [],
    supplierPhrases.length
      ? prisma.supplier.findMany({
          where: { OR: supplierPhrases.map((phrase) => ({ name: { contains: phrase } })) },
          select: { id: true, name: true, isActive: true },
          take: 12,
        })
      : [],
  ]);
  const matchedClients = mergeRecords(exactClients, clients, (value) => value.id);
  const matchedProjects = mergeRecords(exactProjects, projects, (value) => value.id);
  const matchedTasks = mergeRecords(exactTasks, tasks, (value) => value.id);
  const matchedProducts = mergeRecords(exactProducts, products, (value) => value.id);
  const matchedSuppliers = mergeRecords(exactSuppliers, suppliers, (value) => value.id);

  const supplierOrderFilters: Prisma.SupplierOrderWhereInput[] = [];
  if (supplierOrderIds.length) supplierOrderFilters.push({ id: { in: supplierOrderIds } });
  if (projectIds.length) supplierOrderFilters.push({ projectId: { in: projectIds } });
  if (matchedSuppliers.length) supplierOrderFilters.push({ supplierId: { in: matchedSuppliers.map((supplier) => supplier.id) } });
  const relatedSupplierOrders = supplierOrderFilters.length
    ? await prisma.supplierOrder.findMany({
        where: { OR: supplierOrderFilters },
        select: {
          id: true, status: true,
          supplier: { select: { name: true } },
          project: { select: { id: true, title: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: MAX_MATCHES_PER_KIND,
      })
    : [];
  const exactSupplierOrders = supplierOrderIds.length
    ? await prisma.supplierOrder.findMany({
        where: { id: { in: supplierOrderIds } },
        select: {
          id: true, status: true,
          supplier: { select: { name: true } },
          project: { select: { id: true, title: true } },
        },
        take: 12,
      })
    : [];
  const supplierOrders = mergeRecords(exactSupplierOrders, relatedSupplierOrders, (value) => value.id);

  const matches: AssistantRetrievalMatch[] = [];
  const seen = new Set<string>();
  const add = (match: AssistantRetrievalMatch) => {
    const identity = `${match.kind}:${match.ref}`;
    if (seen.has(identity) || matches.length >= MAX_MATCHES) return;
    seen.add(identity);
    matches.push(match);
  };

  for (const client of matchedClients) {
    add({
      kind: "client",
      ref: String(client.id),
      label: `Client #${client.id} · ${safeDisplay(client.name)}${client.company ? ` · ${safeDisplay(client.company)}` : ""}`,
    });
  }
  for (const project of matchedProjects) {
    add({
      kind: "project",
      ref: String(project.id),
      label: `Project #${project.id} · ${safeDisplay(project.title)} · ${safeDisplay(project.status)} · client ${safeDisplay(project.client.name)}`,
    });
  }
  for (const task of matchedTasks) {
    add({
      kind: "task",
      ref: String(task.id),
      label: `Task #${task.id} · ${safeDisplay(task.title)} · ${safeDisplay(task.status)}${task.project ? ` · project ${safeDisplay(task.project.title)}` : ""}`,
    });
  }
  for (const product of matchedProducts) {
    add({
      kind: "product",
      ref: product.sku,
      label: `Product ${safeDisplay(product.sku)} · ${safeDisplay(product.nameAr || product.nameEn)} · ${product.isActive ? "active" : "inactive"}`,
    });
  }
  for (const supplier of matchedSuppliers) {
    add({
      kind: "supplier",
      ref: String(supplier.id),
      label: `Supplier #${supplier.id} · ${safeDisplay(supplier.name)} · ${supplier.isActive ? "active" : "inactive"}`,
    });
  }
  for (const order of supplierOrders) {
    add({
      kind: "supplier-order",
      ref: String(order.id),
      label: `Supplier order #${order.id} · ${safeDisplay(order.status)} · ${safeDisplay(order.supplier.name)} · project #${order.project.id} ${safeDisplay(order.project.title)}`,
    });
  }

  return { matches, modelContext: buildModelContext(matches) };
}
