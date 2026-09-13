import {
  PROJECT_ITEM_STATUSES,
  PROJECT_STATUSES,
  SUPPLIER_ORDER_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type ParsedAssistantAction,
  type ProjectItemStatus,
  type ProjectStatus,
  type SupplierOrderStatus,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "./types.ts";

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const PROJECT_STATUS_ALIASES: Record<string, ProjectStatus> = {
  lead: "LEAD", جديد: "LEAD", محتمل: "LEAD",
  inspection: "INSPECTION", معاينة: "INSPECTION",
  designing: "DESIGNING", تصميم: "DESIGNING",
  pendingapproval: "PENDING_APPROVAL", pending_approval: "PENDING_APPROVAL", "انتظار موافقة": "PENDING_APPROVAL",
  approved: "APPROVED", معتمد: "APPROVED", موافق: "APPROVED",
  inproduction: "IN_PRODUCTION", in_production: "IN_PRODUCTION", تصنيع: "IN_PRODUCTION", "قيد التصنيع": "IN_PRODUCTION",
  ready: "READY", جاهز: "READY",
  installing: "INSTALLING", تركيب: "INSTALLING", "قيد التركيب": "INSTALLING",
  completed: "COMPLETED", مكتمل: "COMPLETED", منتهي: "COMPLETED",
  cancelled: "CANCELLED", canceled: "CANCELLED", ملغي: "CANCELLED",
};

const PRIORITY_ALIASES: Record<string, TaskPriority> = {
  low: "LOW", منخفضة: "LOW", منخفض: "LOW",
  medium: "MEDIUM", متوسطة: "MEDIUM", متوسط: "MEDIUM",
  high: "HIGH", عالية: "HIGH", عالي: "HIGH",
  urgent: "URGENT", عاجلة: "URGENT", عاجل: "URGENT",
};

const TASK_TYPE_ALIASES: Record<string, TaskType> = {
  supplier_followup: "SUPPLIER_FOLLOWUP", "supplier followup": "SUPPLIER_FOLLOWUP", متابعة: "SUPPLIER_FOLLOWUP", مورد: "SUPPLIER_FOLLOWUP", مصنع: "SUPPLIER_FOLLOWUP",
  design: "DESIGN", تصميم: "DESIGN",
  installation: "INSTALLATION", تركيب: "INSTALLATION",
  delivery: "DELIVERY", تسليم: "DELIVERY",
  inspection: "INSPECTION", معاينة: "INSPECTION",
  general: "GENERAL", عامة: "GENERAL", عام: "GENERAL",
};

const TASK_STATUS_ALIASES: Record<string, TaskStatus> = {
  todo: "TODO", جديدة: "TODO", جديد: "TODO", "لم تبدأ": "TODO",
  inprogress: "IN_PROGRESS", in_progress: "IN_PROGRESS", "in progress": "IN_PROGRESS", "قيد التنفيذ": "IN_PROGRESS", جاري: "IN_PROGRESS",
  done: "DONE", مكتملة: "DONE", مكتمل: "DONE", منتهية: "DONE", منتهي: "DONE",
};

const PROJECT_ITEM_STATUS_ALIASES: Record<string, ProjectItemStatus> = {
  pending: "PENDING", معلق: "PENDING", منتظر: "PENDING",
  ordered: "ORDERED", مطلوب: "ORDERED", "تم الطلب": "ORDERED",
  inproduction: "IN_PRODUCTION", in_production: "IN_PRODUCTION", "in production": "IN_PRODUCTION", "قيد التصنيع": "IN_PRODUCTION", تصنيع: "IN_PRODUCTION",
  ready: "READY", جاهز: "READY",
  delivered: "DELIVERED", مسلم: "DELIVERED", "تم التسليم": "DELIVERED",
  installed: "INSTALLED", مركب: "INSTALLED", "تم التركيب": "INSTALLED",
};

const SUPPLIER_ORDER_STATUS_ALIASES: Record<string, SupplierOrderStatus> = {
  pending: "PENDING", معلق: "PENDING", منتظر: "PENDING",
  confirmed: "CONFIRMED", مؤكد: "CONFIRMED", موكد: "CONFIRMED",
  inproduction: "IN_PRODUCTION", in_production: "IN_PRODUCTION", "in production": "IN_PRODUCTION", "قيد التصنيع": "IN_PRODUCTION", تصنيع: "IN_PRODUCTION",
  ready: "READY", جاهز: "READY",
  shipped: "SHIPPED", مشحون: "SHIPPED", "تم الشحن": "SHIPPED",
  delivered: "DELIVERED", مسلم: "DELIVERED", "تم التسليم": "DELIVERED",
  cancelled: "CANCELLED", canceled: "CANCELLED", ملغي: "CANCELLED",
};

const KEY_ALIASES: Record<string, string> = {
  عملية: "operation", اجراء: "operation", إجراء: "operation", action: "operation", operation: "operation", kind: "operation",
  عميل: "client", العميل: "client", "اسم العميل": "client", client: "client", customer: "client",
  "مرجع العميل": "client_ref", "رقم العميل": "client_ref", clientref: "client_ref", client_ref: "client_ref", "client id": "client_ref",
  "تعديل عميل": "update_client", "تحديث عميل": "update_client", "update client": "update_client", "edit client": "update_client",
  "حذف عميل": "delete_client", "delete client": "delete_client", "remove client": "delete_client",
  اسم: "name", name: "name", "الاسم الجديد": "name", newname: "name",
  هاتف: "phone", تليفون: "phone", تلفون: "phone", موبايل: "phone", phone: "phone", mobile: "phone",
  شركة: "company", company: "company", "شركة العميل": "client_company", clientcompany: "client_company", client_company: "client_company",
  بريد: "email", ايميل: "email", إيميل: "email", email: "email", "بريد العميل": "client_email", clientemail: "client_email", client_email: "client_email",
  عنوان: "address", address: "address", "عنوان العميل": "client_address", clientaddress: "client_address", client_address: "client_address",
  مشروع: "project", اوردر: "project", أوردر: "project", order: "project", project: "project",
  "مرجع المشروع": "project_ref", "رقم المشروع": "project_ref", projectref: "project_ref", project_ref: "project_ref", "project id": "project_ref",
  "تعديل مشروع": "update_project", "تحديث مشروع": "update_project", "تعديل اوردر": "update_project", "تعديل أوردر": "update_project", "update project": "update_project", "edit project": "update_project", "update order": "update_project", "edit order": "update_project",
  "حذف مشروع": "delete_project", "حذف اوردر": "delete_project", "حذف أوردر": "delete_project", "delete project": "delete_project", "remove project": "delete_project", "delete order": "delete_project",
  "اسم المشروع": "title", "عنوان المشروع": "title", "اسم المهمة": "title", title: "title",
  كود: "sku", "كود المنتج": "sku", منتج: "sku", المنتج: "sku", sku: "sku", code: "sku",
  كمية: "quantity", عدد: "quantity", qty: "quantity", quantity: "quantity",
  سعر: "unit_price", السعر: "unit_price", "سعر البيع": "unit_price", "سعر الوحدة": "unit_price", unitprice: "unit_price", unit_price: "unit_price", "unit price": "unit_price", sellingprice: "unit_price", selling_price: "unit_price",
  تكلفة: "unit_cost", التكلفة: "unit_cost", "سعر التكلفة": "unit_cost", "تكلفة الوحدة": "unit_cost", unitcost: "unit_cost", unit_cost: "unit_cost", "unit cost": "unit_cost", costprice: "unit_cost", cost_price: "unit_cost",
  "تعديل منتج": "update_project_item", "تحديث منتج": "update_project_item", "تعديل صنف": "update_project_item", "update item": "update_project_item", "edit item": "update_project_item",
  "حذف منتج": "remove_project_item", "ازالة منتج": "remove_project_item", "إزالة منتج": "remove_project_item", "حذف صنف": "remove_project_item", "remove item": "remove_project_item", "delete item": "remove_project_item",
  مصنع: "supplier", مورد: "supplier", factory: "supplier", supplier: "supplier",
  حالة: "status", status: "status",
  مهمة: "task", task: "task", "مرجع المهمة": "task_ref", "رقم المهمة": "task_ref", taskref: "task_ref", task_ref: "task_ref", "task id": "task_ref",
  "تعديل مهمة": "update_task", "تحديث مهمة": "update_task", "update task": "update_task", "edit task": "update_task",
  "حذف مهمة": "delete_task", "delete task": "delete_task", "remove task": "delete_task",
  موعد: "due", تاريخ: "due", due: "due", duedate: "due", due_date: "due", "موعد المهمة": "due",
  "موعد التسليم": "estimated_delivery", "التسليم المتوقع": "estimated_delivery", estimateddelivery: "estimated_delivery", estimated_delivery: "estimated_delivery", "delivery date": "estimated_delivery",
  اولوية: "priority", أولوية: "priority", priority: "priority", "اولوية المشروع": "project_priority", "أولوية المشروع": "project_priority", projectpriority: "project_priority", project_priority: "project_priority",
  نوع: "type", type: "type",
  وصف: "description", description: "description",
  ملاحظات: "notes", notes: "notes", "ملاحظات العميل": "client_notes", clientnotes: "client_notes", client_notes: "client_notes",
  "ملاحظات المشروع": "project_notes", projectnotes: "project_notes", project_notes: "project_notes",
  "ملاحظات المنتج": "item_notes", "ملاحظات الصنف": "item_notes", itemnotes: "item_notes", item_notes: "item_notes",
  "امر توريد": "supplier_order", "أمر توريد": "supplier_order", "طلب توريد": "supplier_order", "supplier order": "supplier_order",
  "مرجع امر التوريد": "supplier_order_ref", "رقم امر التوريد": "supplier_order_ref", "مرجع أمر التوريد": "supplier_order_ref", "رقم أمر التوريد": "supplier_order_ref", orderref: "supplier_order_ref", order_ref: "supplier_order_ref", "supplier order id": "supplier_order_ref",
};

const CLEAR_VALUES = new Set(["null", "none", "clear", "empty", "مسح", "امسح", "إمسح", "فارغ", "بدون"]);
const UPDATE_VERB = /(?:عدل|عدّل|تعديل|غير|غيّر|تغيير|حدث|حدّث|تحديث|update|edit|change)/iu;
const DELETE_VERB = /(?:احذف|إحذف|حذف|امسح|إمسح|ازالة|إزالة|delete|remove)/iu;
const LINKED_OPERATION_SEPARATOR = /\s*(?:,|،)?\s*(?:(?:and\s+then)|then|after\s+that|ثم|وبعدها|وبعدين|و?بعد\s+كده|و?بعد\s+ذلك)\s+(?=(?:operation|action|create|add|register|start|open|update|edit|change|set|delete|remove|clear|اعمل|اضف|أضف|سجل|افتح|عدل|عدّل|غير|غيّر|حدث|حدّث|احذف|إحذف|حذف|امسح|إمسح|ازالة|إزالة|خلي|خلّي)(?:\s|:))/giu;

function normalizeArabicLetters(value: string): string {
  return value
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "");
}

export function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
}

function normalizedKey(value: string): string {
  return normalizeArabicLetters(normalizeDigits(value))
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ");
}

function lookupAlias<T>(aliases: Record<string, T>, value: string): T | undefined {
  const normalized = normalizedKey(value);
  return Object.entries(aliases).find(([alias]) => normalizedKey(alias) === normalized)?.[1];
}

function cleanValue(value: string): string {
  return normalizeDigits(value).trim().replace(/^["'“”]+|["'“”]+$/g, "");
}

function cleanPhone(value: string): string {
  const normalized = normalizeDigits(value).replace(/[^\d+]/g, "");
  if (normalized.startsWith("0020")) return `+20${normalized.slice(4)}`;
  return normalized;
}

function cleanSku(value: string): string {
  return cleanValue(value).toUpperCase().replace(/\s+/g, "");
}

function cleanProductReference(value: string): string {
  const cleaned = cleanValue(value);
  return /^[A-Z]{2,10}(?:-[A-Z0-9]{2,})+$/iu.test(cleaned.replace(/\s+/g, ""))
    ? cleanSku(cleaned)
    : cleaned;
}

function parseQuantity(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = normalizeDigits(value).trim();
  if (!/^\d+$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10_000 ? quantity : null;
}

function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = normalizeDigits(value)
    .trim()
    .replace(/٫/g, ".")
    .replace(/(?:جنيه|ج\.م|egp)$/iu, "")
    .trim();
  if (!/^(?:\d+|\d{1,3}(?:[,٬]\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized.replace(/[,٬]/g, ""));
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null;
}

function enumFrom<T extends string>(values: readonly T[], aliases: Record<string, T>, value: string | undefined): T | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((values as readonly string[]).includes(upper)) return upper as T;
  const normalized = normalizedKey(value);
  return lookupAlias(aliases, normalized) ?? lookupAlias(aliases, normalized.replace(/\s+/g, "")) ?? null;
}

function statusFrom(value: string | undefined): ProjectStatus | null {
  return enumFrom(PROJECT_STATUSES, PROJECT_STATUS_ALIASES, value);
}

function priorityFrom(value: string | undefined): TaskPriority | null {
  return enumFrom(TASK_PRIORITIES, PRIORITY_ALIASES, value);
}

function taskTypeFrom(value: string | undefined): TaskType | null {
  return enumFrom(TASK_TYPES, TASK_TYPE_ALIASES, value);
}

function taskStatusFrom(value: string | undefined): TaskStatus | null {
  return enumFrom(TASK_STATUSES, TASK_STATUS_ALIASES, value);
}

function itemStatusFrom(value: string | undefined): ProjectItemStatus | null {
  return enumFrom(PROJECT_ITEM_STATUSES, PROJECT_ITEM_STATUS_ALIASES, value);
}

function supplierOrderStatusFrom(value: string | undefined): SupplierOrderStatus | null {
  return enumFrom(SUPPLIER_ORDER_STATUSES, SUPPLIER_ORDER_STATUS_ALIASES, value);
}

const ARABIC_MONTHS: Record<string, number> = {
  يناير: 0, فبراير: 1, مارس: 2, ابريل: 3, أبريل: 3, مايو: 4, يونيو: 5,
  يوليو: 6, اغسطس: 7, أغسطس: 7, سبتمبر: 8, اكتوبر: 9, أكتوبر: 9, نوفمبر: 10, ديسمبر: 11,
};

function parseDate(value: string | undefined, now = new Date()): string | null {
  if (!value) return null;
  const cleaned = cleanValue(value);
  const normalized = normalizedKey(cleaned);
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  if (["اليوم", "today"].includes(normalized)) return date.toISOString();
  if (["غدا", "بكره", "tomorrow"].includes(normalized)) {
    date.setDate(date.getDate() + 1);
    return date.toISOString();
  }
  const arabicDate = normalizeDigits(cleaned).match(/^(\d{1,2})\s+([\p{L}]+)(?:\s+(\d{4}))?$/u);
  if (arabicDate) {
    const month = ARABIC_MONTHS[arabicDate[2]] ?? ARABIC_MONTHS[normalizeArabicLetters(arabicDate[2])];
    if (month !== undefined) {
      const year = arabicDate[3] ? Number(arabicDate[3]) : now.getFullYear();
      const candidate = new Date(year, month, Number(arabicDate[1]), 12, 0, 0, 0);
      if (candidate.getFullYear() === year && candidate.getMonth() === month && candidate.getDate() === Number(arabicDate[1])) return candidate.toISOString();
    }
  }
  const parsed = new Date(normalizeDigits(cleaned));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function keyValueFields(segment: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of segment.split("|")) {
    const match = part.match(/^\s*([^:：=]+?)\s*[:：=]\s*(.+?)\s*$/u);
    if (!match) continue;
    const key = lookupAlias(KEY_ALIASES, match[1]) ?? normalizedKey(match[1]);
    fields[key] = cleanValue(match[2]);
  }
  return fields;
}

function patchText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const cleaned = cleanValue(value);
  return CLEAR_VALUES.has(normalizedKey(cleaned)) ? null : cleaned;
}

function hasField(fields: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(fields, key);
}

function operationFrom(fields: Record<string, string>): ParsedAssistantAction["kind"] | null {
  const direct = fields.operation?.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const allowed: ParsedAssistantAction["kind"][] = [
    "CREATE_CLIENT", "CREATE_ORDER_BUNDLE", "UPDATE_PROJECT_STATUS", "CREATE_TASK", "ADD_PROJECT_ITEM",
    "UPDATE_CLIENT", "DELETE_CLIENT", "UPDATE_PROJECT", "DELETE_PROJECT", "UPDATE_PROJECT_ITEM",
    "REMOVE_PROJECT_ITEM", "UPDATE_TASK", "DELETE_TASK", "UPDATE_SUPPLIER_ORDER_STATUS",
  ];
  if (direct && allowed.includes(direct as ParsedAssistantAction["kind"])) return direct as ParsedAssistantAction["kind"];
  const markers: Array<[string, ParsedAssistantAction["kind"]]> = [
    ["update_client", "UPDATE_CLIENT"], ["delete_client", "DELETE_CLIENT"],
    ["update_project", "UPDATE_PROJECT"], ["delete_project", "DELETE_PROJECT"],
    ["update_project_item", "UPDATE_PROJECT_ITEM"], ["remove_project_item", "REMOVE_PROJECT_ITEM"],
    ["update_task", "UPDATE_TASK"], ["delete_task", "DELETE_TASK"],
  ];
  return markers.find(([field]) => hasField(fields, field))?.[1] ?? null;
}

function structuredDatePatch(fields: Record<string, string>, key: string, now: Date): string | null | undefined | false {
  if (!hasField(fields, key)) return undefined;
  const value = patchText(fields[key]);
  if (value === null) return null;
  return parseDate(value, now) ?? false;
}

function parseKeyValueSegment(segment: string, now: Date): ParsedAssistantAction | null {
  const fields = keyValueFields(segment);
  if (Object.keys(fields).length === 0) return null;
  const operation = operationFrom(fields);

  if (operation === "UPDATE_CLIENT") {
    const clientRef = fields.client_ref ?? fields.update_client ?? fields.client;
    if (!clientRef) return null;
    const name = patchText(fields.name);
    const phone = hasField(fields, "phone") ? cleanPhone(fields.phone) : undefined;
    const company = patchText(fields.company);
    const email = patchText(fields.email);
    const address = patchText(fields.address);
    const notes = patchText(fields.notes);
    if (phone !== undefined && !phone) return null;
    if ([name, phone, company, email, address, notes].every((value) => value === undefined)) return null;
    return { kind: operation, source: segment, clientRef, name: name ?? undefined, phone, company, email, address, notes };
  }

  if (operation === "DELETE_CLIENT") {
    const clientRef = fields.client_ref ?? fields.delete_client ?? fields.client;
    return clientRef ? { kind: operation, source: segment, clientRef } : null;
  }

  if (operation === "UPDATE_PROJECT") {
    const projectRef = fields.project_ref ?? fields.update_project ?? fields.project;
    if (!projectRef) return null;
    const title = patchText(fields.title);
    const status = hasField(fields, "status") ? statusFrom(fields.status) ?? undefined : undefined;
    const priority = hasField(fields, "priority") ? priorityFrom(fields.priority) ?? undefined : undefined;
    const notes = patchText(fields.notes);
    const estimatedDelivery = structuredDatePatch(fields, "estimated_delivery", now);
    if ((hasField(fields, "status") && !status) || (hasField(fields, "priority") && !priority) || estimatedDelivery === false) return null;
    if ([title, status, priority, notes, estimatedDelivery].every((value) => value === undefined)) return null;
    return { kind: operation, source: segment, projectRef, title: title ?? undefined, status, priority, notes, estimatedDelivery };
  }

  if (operation === "DELETE_PROJECT") {
    const projectRef = fields.project_ref ?? fields.delete_project ?? fields.project;
    return projectRef ? { kind: operation, source: segment, projectRef } : null;
  }

  if (operation === "UPDATE_PROJECT_ITEM") {
    const projectRef = fields.project_ref ?? fields.project;
    const productSku = fields.sku ? cleanSku(fields.sku) : "";
    if (!projectRef || !productSku) return null;
    const quantity = hasField(fields, "quantity") ? parseQuantity(fields.quantity) : undefined;
    const status = hasField(fields, "status") ? itemStatusFrom(fields.status) ?? undefined : undefined;
    const notes = patchText(fields.notes ?? fields.item_notes);
    if ((hasField(fields, "quantity") && quantity === null) || (hasField(fields, "status") && !status)) return null;
    if ([quantity, status, notes].every((value) => value === undefined)) return null;
    return { kind: operation, source: segment, projectRef, productSku, quantity: quantity ?? undefined, status, notes };
  }

  if (operation === "REMOVE_PROJECT_ITEM") {
    const projectRef = fields.project_ref ?? fields.project;
    const productSku = fields.sku ? cleanSku(fields.sku) : "";
    return projectRef && productSku ? { kind: operation, source: segment, projectRef, productSku } : null;
  }

  if (operation === "UPDATE_TASK") {
    const taskRef = fields.task_ref ?? fields.update_task ?? fields.task;
    if (!taskRef) return null;
    const title = patchText(fields.title);
    const dueDate = structuredDatePatch(fields, "due", now);
    const status = hasField(fields, "status") ? taskStatusFrom(fields.status) ?? undefined : undefined;
    const priority = hasField(fields, "priority") ? priorityFrom(fields.priority) ?? undefined : undefined;
    const taskType = hasField(fields, "type") ? taskTypeFrom(fields.type) ?? undefined : undefined;
    const description = patchText(fields.description ?? fields.notes);
    if (dueDate === false || (hasField(fields, "status") && !status) || (hasField(fields, "priority") && !priority) || (hasField(fields, "type") && !taskType)) return null;
    if ([title, dueDate, status, priority, taskType, description].every((value) => value === undefined)) return null;
    return { kind: operation, source: segment, taskRef, title: title ?? undefined, dueDate: dueDate ?? undefined, status, priority, taskType, description };
  }

  if (operation === "DELETE_TASK") {
    const taskRef = fields.task_ref ?? fields.delete_task ?? fields.task;
    return taskRef ? { kind: operation, source: segment, taskRef } : null;
  }

  if (operation === "UPDATE_SUPPLIER_ORDER_STATUS" || fields.supplier_order || fields.supplier_order_ref) {
    const orderRef = fields.supplier_order_ref ?? fields.supplier_order;
    const status = supplierOrderStatusFrom(fields.status);
    return orderRef && status ? { kind: "UPDATE_SUPPLIER_ORDER_STATUS", source: segment, orderRef, status } : null;
  }

  if (operation && !["CREATE_CLIENT", "CREATE_ORDER_BUNDLE", "UPDATE_PROJECT_STATUS", "CREATE_TASK", "ADD_PROJECT_ITEM"].includes(operation)) return null;

  if (fields.client && fields.phone && fields.project && fields.sku) {
    const quantity = parseQuantity(fields.quantity);
    const unitPrice = hasField(fields, "unit_price") ? parseMoney(fields.unit_price) : undefined;
    const unitCost = hasField(fields, "unit_cost") ? parseMoney(fields.unit_cost) : undefined;
    if (quantity === null) return null;
    const estimatedDelivery = structuredDatePatch(fields, "estimated_delivery", now);
    const projectPriority = hasField(fields, "project_priority") ? priorityFrom(fields.project_priority) ?? undefined : undefined;
    if (
      estimatedDelivery === false
      || (hasField(fields, "project_priority") && !projectPriority)
      || (hasField(fields, "unit_price") && unitPrice === null)
      || (hasField(fields, "unit_cost") && unitCost === null)
    ) return null;
    return {
      kind: "CREATE_ORDER_BUNDLE", source: segment,
      clientName: fields.client, clientPhone: cleanPhone(fields.phone), projectTitle: fields.project,
      productSku: cleanProductReference(fields.sku), quantity,
      unitPrice: unitPrice ?? undefined,
      unitCost: unitCost ?? undefined,
      supplierQuery: fields.supplier,
      clientCompany: fields.client_company ?? fields.company,
      clientEmail: fields.client_email ?? fields.email,
      clientAddress: fields.client_address ?? fields.address,
      clientNotes: fields.client_notes,
      projectPriority,
      projectNotes: fields.project_notes,
      estimatedDelivery: estimatedDelivery ?? undefined,
      itemNotes: fields.item_notes,
    };
  }

  if (fields.client && fields.phone && !fields.sku && !fields.project) {
    return { kind: "CREATE_CLIENT", source: segment, name: fields.client, phone: cleanPhone(fields.phone), company: fields.company, notes: fields.notes };
  }

  const projectStatus = statusFrom(fields.status);
  if (fields.project && projectStatus && Object.keys(fields).every((key) => ["project", "status"].includes(key))) {
    return { kind: "UPDATE_PROJECT_STATUS", source: segment, projectRef: fields.project, status: projectStatus };
  }

  if (fields.task) {
    const dueDate = parseDate(fields.due, now);
    const priority = priorityFrom(fields.priority);
    const taskType = taskTypeFrom(fields.type);
    if (!dueDate || !priority || !taskType) return null;
    return {
      kind: "CREATE_TASK", source: segment, title: fields.task, dueDate, projectRef: fields.project,
      priority, taskType,
      description: fields.description ?? fields.notes,
    };
  }

  if (fields.project && fields.sku) {
    const quantity = parseQuantity(fields.quantity);
    if (quantity === null) return null;
    return { kind: "ADD_PROJECT_ITEM", source: segment, projectRef: fields.project, productSku: cleanSku(fields.sku), quantity, notes: fields.notes ?? fields.item_notes };
  }

  return null;
}

function matchPhone(segment: string): string | null {
  const match = normalizeDigits(segment).match(/(?<!\d)(?:\+?20|0020|0)?1[0125](?:[\s-]*\d){8}(?![\s-]*\d)/);
  return match ? cleanPhone(match[0]) : null;
}

function matchSku(segment: string): string | null {
  return normalizeDigits(segment).toUpperCase().match(/\b[A-Z]{2,8}(?:-[A-Z0-9]{2,})+\b/)?.[0] ?? null;
}

function matchNumericRef(segment: string, entity: RegExp): string | null {
  return normalizeDigits(segment).match(entity)?.[1] ?? null;
}

function matchClientName(segment: string): string | null {
  const match = segment.match(/(?:اسم\s+العميل|العميل|عميل|اسمه|client|customer)\s*[:=]?\s*([\p{L}][\p{L}\s.'-]{1,48}?)(?=\s+(?:هاتف|تليفون|تلفون|موبايل|phone|mobile|\+?\d|اوردر|أوردر|طلب|مشروع|order|project)|[|،,;.؛]|$)/iu);
  return match ? cleanValue(match[1]) : null;
}

function matchProjectTitle(segment: string): string | null {
  const match = segment.match(/(?:اوردر|أوردر|مشروع|order|project)\s*[:=]?\s*([\p{L}\p{N}][\p{L}\p{N}\s.'_-]{1,60}?)(?=\s+(?:كود|code|sku|المنتج|منتج|كمية|عدد|qty|مصنع|مورد|factory|supplier)|[|،,;.؛]|$)/iu);
  return match ? cleanValue(match[1]) : null;
}

export interface NaturalOrderDraft {
  source: string;
  clientName?: string;
  clientPhone?: string;
  projectTitle?: string;
  productReference?: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
  supplierQuery?: string;
  ambiguousCost?: number;
  ambiguousPrice?: number;
  invalidFields: string[];
}

function matchOrderProductReference(segment: string): string | null {
  const match = normalizeDigits(segment).match(
    /(?:طلب|اوردر|أوردر|order)\s*(?:منتج|صنف|product|item)?\s*[:=]?\s*([\p{L}\p{N}][\p{L}\p{N}\s.'_-]{1,80}?)(?=\s+(?:(?:كمية|عدد|qty\b|quantity\b)|(?:بسعر|سعر|price\b)|ب\s*[:=]?\s*\d|(?:هي|هيا|تكلفته|تكلفتها)?\s*علينا(?:\s|$)|(?:هنعمله|هنعملها|هيتعمل|هيتعمله|عند|مصنع|مورد)|من\s+[\p{L}\p{N}])|[|،,;.؛]|$)/iu,
  );
  return match ? cleanValue(match[1]) : null;
}

function matchNaturalSupplier(segment: string): string | undefined {
  const at = segment.match(/(?:هنعمله|هنعملها|هيتعمل|هيتعمله)?\s*عند\s+([\p{L}][\p{L}\p{N}\s.'_-]{0,50}?)(?=\s+و?\s*(?:هيقف|هيكلف|التكلفة|تكلفة|علينا|سعر|بعته|بعنا|بيع)|[|،,;.؛]|$)/iu);
  if (at) return cleanValue(at[1]);
  const labelled = segment.match(
    /(?:مصنع|مورد|factory|supplier)\s*(?:اسمه|name)?\s*[:=]?\s*([\p{L}\p{N}][\p{L}\p{N}\s.'_-]{0,50}?)(?=[|،,;.؛]|$)/iu,
  );
  if (labelled) return cleanValue(labelled[1]);
  const from = segment.match(/\s+من\s+([\p{L}\p{N}][\p{L}\p{N}\s.'_-]{0,50}?)\s*$/iu);
  return from ? cleanValue(from[1]) : undefined;
}

export function inspectNaturalOrderDraft(segment: string): NaturalOrderDraft | null {
  if (
    !/(?:عميل|client|customer)/iu.test(segment)
    || !/(?:طلب|اوردر|أوردر|order)/iu.test(segment)
  ) return null;

  const normalized = normalizeDigits(segment);
  const clientName = matchClientName(segment) ?? undefined;
  const clientPhone = matchPhone(segment) ?? undefined;
  const productReference = matchSku(segment) ?? matchOrderProductReference(segment) ?? undefined;
  const quantityText = normalized.match(/(?:كمية|عدد|qty|quantity)\s*[:=]?\s*([^\s|،,;.؛]+)/iu)?.[1];
  const quantity = quantityText === undefined ? undefined : parseQuantity(quantityText) ?? undefined;
  const costMatch = normalized.match(/(?:(?:هي|هيا|تكلفته|تكلفتها|هيقف|هيكلف)?\s*علينا|التكلفة|تكلفة)\s*(?:ب|بسعر)?\s*[:=]?\s*([+-]?[\d.,٬٫]+)(?:\s*(ألف|الف|آلاف|الاف|k|جنيه|جنيهات|EGP))?/iu);
  const priceMatch = normalized.match(/(?:سعر\s*البيع|للعميل|بعته|بعتها|بعناه|بعت|بيع|بسعر)\s*(?:ب)?\s*[:=]?\s*([+-]?[\d.,٬٫]+)(?:\s*(ألف|الف|آلاف|الاف|k|جنيه|جنيهات|EGP))?/iu)
    ?? normalized.match(/(?:^|\s)ب\s*[:=]?\s*([+-]?[\d.,٬٫]+)(?:\s*(ألف|الف|آلاف|الاف|k|جنيه|جنيهات|EGP))?/iu);
  const costText = costMatch?.[1];
  const priceText = priceMatch?.[1];
  const money = (value: string | undefined, suffix: string | undefined) => {
    const number = parseMoney(value);
    return number === null ? undefined : number * (suffix && /^(?:ألف|الف|آلاف|الاف|k)$/iu.test(suffix) ? 1000 : 1);
  };
  const unitPrice = money(priceText, priceMatch?.[2]);
  const unitCost = money(costText, costMatch?.[2]);
  const ambiguousCost = unitCost !== undefined && unitCost > 0 && unitCost < 1000 && !costMatch?.[2] ? unitCost : undefined;
  const ambiguousPrice = unitPrice !== undefined && unitPrice > 0 && unitPrice < 1000 && !priceMatch?.[2] ? unitPrice : undefined;
  const invalidFields: string[] = [];
  if (quantityText !== undefined && quantity === undefined) invalidFields.push("quantity");
  if ((priceText !== undefined || /(?:سعر\s*البيع|بعته|بعتها|بسعر)/iu.test(segment)) && unitPrice === undefined) invalidFields.push("unitPrice");
  if ((costText !== undefined || /(?:علينا|التكلفة|تكلفة)/iu.test(segment)) && unitCost === undefined) invalidFields.push("unitCost");
  if (ambiguousCost !== undefined) invalidFields.push("unitCostScale");
  if (ambiguousPrice !== undefined) invalidFields.push("unitPriceScale");
  if (/(?:إجمالي|اجمالي|الإجمالية|الاجمالية|جملة|total)/iu.test(segment)) invalidFields.push("amountBasis");

  return {
    source: segment,
    clientName,
    clientPhone,
    projectTitle: productReference ? `طلب ${productReference}` : undefined,
    productReference,
    quantity,
    unitPrice,
    unitCost,
    ambiguousCost,
    ambiguousPrice,
    supplierQuery: matchNaturalSupplier(segment),
    invalidFields,
  };
}

function captureLabel(segment: string, label: RegExp): string | undefined {
  const flags = label.flags.includes("u") ? label.flags : `${label.flags}u`;
  const nextField = String.raw`(?:و?(?:الهاتف|هاتف|التليفون|تليفون|الموبايل|موبايل|phone|mobile|الاسم|اسم|name|الشركة|شركة|company|البريد|الايميل|الإيميل|email|العنوان|عنوان|address|الحالة|حالة|status|الاولوية|الأولوية|اولوية|أولوية|priority|النوع|نوع|type|الموعد|موعد|التاريخ|تاريخ|due|الوصف|وصف|description|الملاحظات|ملاحظات|notes|موعد\s+التسليم|estimated\s+delivery))`;
  return segment.match(new RegExp(`${label.source}\\s*(?:الى|إلى|to|[:=])?\\s*([^|،,;.؛]+?)(?=\\s+${nextField}(?:\\s|[:=])|$)`, flags))?.[1]?.trim();
}

function afterTransition(value: string | undefined): string | undefined {
  if (!value) return value;
  const pieces = value.split(/\s+(?:الى|إلى|to)\s+/iu);
  return pieces[pieces.length - 1]?.trim();
}

function parseNaturalMutations(segment: string, now: Date): ParsedAssistantAction | null | "MUTATION_INTENT" {
  const normalized = normalizeDigits(segment);
  const isUpdate = UPDATE_VERB.test(segment);
  const isDelete = DELETE_VERB.test(segment);
  if (!isUpdate && !isDelete) return null;

  const supplierOrderRef = matchNumericRef(normalized, /(?:امر\s+التوريد|أمر\s+التوريد|طلب\s+التوريد|supplier\s+order)\s*(?:رقم|id|#)?\s*[:=]?\s*(\d+)/iu);
  if (isUpdate && supplierOrderRef) {
    const statusText = afterTransition(captureLabel(segment, /(?:حالة|status)/iu))
      ?? segment.match(/(?:الى|إلى|to)\s+([\p{L}_ -]+?)\s*$/iu)?.[1];
    const status = supplierOrderStatusFrom(statusText?.replace(/^(?:لـ|ل|to)\s+/iu, ""));
    return status ? { kind: "UPDATE_SUPPLIER_ORDER_STATUS", source: segment, orderRef: supplierOrderRef, status } : "MUTATION_INTENT";
  }

  const sku = matchSku(segment);
  const projectRef = matchNumericRef(normalized, /(?:المشروع|مشروع|project|الاوردر|الطلب)\s*(?:رقم|id|#)?\s*[:=]?\s*(\d+)/iu);
  if (sku && projectRef && /(?:المنتج|منتج|الصنف|صنف|item|product)/iu.test(segment)) {
    if (isDelete) return { kind: "REMOVE_PROJECT_ITEM", source: segment, projectRef, productSku: sku };
    const quantityText = captureLabel(segment, /(?:الكمية|كمية|العدد|عدد|qty|quantity)/iu);
    const quantity = quantityText === undefined ? undefined : parseQuantity(quantityText.match(/^\d+/)?.[0]);
    const statusText = captureLabel(segment, /(?:الحالة|حالة|status)/iu);
    const status = statusText === undefined ? undefined : itemStatusFrom(afterTransition(statusText)) ?? undefined;
    const notesText = captureLabel(segment, /(?:الملاحظات|ملاحظات|notes)/iu);
    const notes = notesText === undefined ? undefined : patchText(notesText);
    if ((quantityText !== undefined && quantity === null) || (statusText !== undefined && !status)) return "MUTATION_INTENT";
    if ([quantity, status, notes].every((value) => value === undefined)) return "MUTATION_INTENT";
    return { kind: "UPDATE_PROJECT_ITEM", source: segment, projectRef, productSku: sku, quantity: quantity ?? undefined, status, notes };
  }

  const clientRef = matchNumericRef(normalized, /(?:العميل|عميل|client|customer)\s*(?:رقم|id|#)?\s*[:=]?\s*(\d+)/iu);
  if (clientRef) {
    if (isDelete) return { kind: "DELETE_CLIENT", source: segment, clientRef };
    const phone = /(?:هاتف|تليفون|تلفون|موبايل|phone|mobile)/iu.test(segment) ? matchPhone(segment) ?? undefined : undefined;
    const name = captureLabel(segment, /(?:الاسم|اسم\s+العميل|name)/iu);
    const company = captureLabel(segment, /(?:الشركة|شركة|company)/iu);
    const email = captureLabel(segment, /(?:البريد|الايميل|الإيميل|email)/iu);
    const address = captureLabel(segment, /(?:العنوان|عنوان|address)/iu);
    const notes = captureLabel(segment, /(?:الملاحظات|ملاحظات|notes)/iu);
    if ([name, phone, company, email, address, notes].every((value) => value === undefined)) return "MUTATION_INTENT";
    return { kind: "UPDATE_CLIENT", source: segment, clientRef, name, phone, company, email, address, notes };
  }

  const taskRef = matchNumericRef(normalized, /(?:المهمة|مهمة|task)\s*(?:رقم|id|#)?\s*[:=]?\s*(\d+)/iu);
  if (taskRef) {
    if (isDelete) return { kind: "DELETE_TASK", source: segment, taskRef };
    const title = captureLabel(segment, /(?:العنوان|عنوان\s+المهمة|title)/iu);
    const dueText = captureLabel(segment, /(?:الموعد|موعد|التاريخ|تاريخ|due)/iu);
    const dueDate = dueText === undefined ? undefined : parseDate(dueText, now) ?? undefined;
    const statusText = captureLabel(segment, /(?:الحالة|حالة|status)/iu);
    const status = statusText === undefined ? undefined : taskStatusFrom(afterTransition(statusText)) ?? undefined;
    const priorityText = captureLabel(segment, /(?:الاولوية|الأولوية|اولوية|أولوية|priority)/iu);
    const priority = priorityText === undefined ? undefined : priorityFrom(priorityText) ?? undefined;
    const typeText = captureLabel(segment, /(?:النوع|نوع|type)/iu);
    const taskType = typeText === undefined ? undefined : taskTypeFrom(typeText) ?? undefined;
    const descriptionText = captureLabel(segment, /(?:الوصف|وصف|description|الملاحظات|ملاحظات|notes)/iu);
    const description = descriptionText === undefined ? undefined : patchText(descriptionText);
    if ((dueText !== undefined && !dueDate) || (statusText !== undefined && !status) || (priorityText !== undefined && !priority) || (typeText !== undefined && !taskType)) return "MUTATION_INTENT";
    if ([title, dueDate, status, priority, taskType, description].every((value) => value === undefined)) return "MUTATION_INTENT";
    return { kind: "UPDATE_TASK", source: segment, taskRef, title, dueDate, status, priority, taskType, description };
  }

  if (projectRef) {
    if (isDelete) return { kind: "DELETE_PROJECT", source: segment, projectRef };
    if (/(?:الكمية|كمية|العدد|عدد|qty|quantity)/iu.test(segment) && !sku) return "MUTATION_INTENT";
    const title = captureLabel(segment, /(?:العنوان|اسم\s+المشروع|title)/iu);
    const statusText = captureLabel(segment, /(?:الحالة|حالة|status)/iu);
    const status = statusText === undefined ? undefined : statusFrom(afterTransition(statusText)?.replace(/^(?:لـ|ل|to)\s+/iu, "")) ?? undefined;
    const priorityText = captureLabel(segment, /(?:الاولوية|الأولوية|اولوية|أولوية|priority)/iu);
    const priority = priorityText === undefined ? undefined : priorityFrom(priorityText) ?? undefined;
    const notesText = captureLabel(segment, /(?:الملاحظات|ملاحظات|notes)/iu);
    const notes = notesText === undefined ? undefined : patchText(notesText);
    const deliveryText = captureLabel(segment, /(?:موعد\s+التسليم|التسليم\s+المتوقع|estimated\s+delivery|delivery\s+date)/iu);
    const estimatedDelivery = deliveryText === undefined ? undefined : parseDate(deliveryText, now) ?? undefined;
    if ((statusText !== undefined && !status) || (priorityText !== undefined && !priority) || (deliveryText !== undefined && !estimatedDelivery)) return "MUTATION_INTENT";
    if (status && [title, priority, notes, estimatedDelivery].every((value) => value === undefined)) return { kind: "UPDATE_PROJECT_STATUS", source: segment, projectRef, status };
    if ([title, status, priority, notes, estimatedDelivery].every((value) => value === undefined)) return "MUTATION_INTENT";
    return { kind: "UPDATE_PROJECT", source: segment, projectRef, title, status, priority, notes, estimatedDelivery };
  }

  return "MUTATION_INTENT";
}

function parseFreeTextSegment(segment: string, now: Date): ParsedAssistantAction | null {
  const mutation = parseNaturalMutations(segment, now);
  if (mutation === "MUTATION_INTENT") return null;
  if (mutation) return mutation;

  const orderDraft = inspectNaturalOrderDraft(segment);
  if (
    orderDraft?.clientName
    && orderDraft.clientPhone
    && orderDraft.projectTitle
    && orderDraft.productReference
    && orderDraft.quantity !== undefined
    && orderDraft.invalidFields.length === 0
  ) {
    return {
      kind: "CREATE_ORDER_BUNDLE",
      source: segment,
      clientName: orderDraft.clientName,
      clientPhone: orderDraft.clientPhone,
      projectTitle: orderDraft.projectTitle,
      productSku: cleanProductReference(orderDraft.productReference),
      quantity: orderDraft.quantity,
      unitPrice: orderDraft.unitPrice,
      unitCost: orderDraft.unitCost,
      supplierQuery: orderDraft.supplierQuery,
    };
  }

  const phone = matchPhone(segment);
  const sku = matchSku(segment);
  const clientName = matchClientName(segment);
  if (phone && sku && clientName) {
    const projectTitle = matchProjectTitle(segment);
    const quantityMatch = normalizeDigits(segment).match(/(?:كمية|عدد|qty|quantity)\s*[:=]?\s*(\d+)/iu);
    const quantity = parseQuantity(quantityMatch?.[1]);
    if (!projectTitle || quantity === null) return null;
    const supplierMatch = segment.match(/(?:مصنع|مورد|factory|supplier)\s*[:=]?\s*([\p{L}\p{N}][\p{L}\p{N}\s.'_-]{1,50}?)(?=[|،,;.؛]|$)/iu);
    return { kind: "CREATE_ORDER_BUNDLE", source: segment, clientName, clientPhone: phone, projectTitle, productSku: sku, quantity, supplierQuery: supplierMatch ? cleanValue(supplierMatch[1]) : undefined };
  }

  const projectRef = matchNumericRef(segment, /(?:المشروع|مشروع|project)\s*(?:رقم|id|#)?\s*[:=]?\s*(\d+)/iu);
  if (projectRef && sku && /(?:اضف|أضف|add)/iu.test(segment)) {
    const quantityMatch = normalizeDigits(segment).match(/(?:كمية|عدد|qty|quantity)\s*[:=]?\s*(\d+)/iu);
    const quantity = parseQuantity(quantityMatch?.[1]);
    if (quantity === null) return null;
    return { kind: "ADD_PROJECT_ITEM", source: segment, projectRef, productSku: sku, quantity };
  }

  if (phone && clientName && /(?:اضف|أضف|سجل|register|create|عميل|client|customer)/iu.test(segment)) return { kind: "CREATE_CLIENT", source: segment, name: clientName, phone };

  const taskMatch = segment.match(/(?:مهمة|task)\s*[:=]?\s*(.+)$/iu);
  if (taskMatch) {
    const dueMatch = segment.match(/(?:موعد|تاريخ|due)\s*[:=]?\s*([^|،,;.؛]+)/iu);
    const dueDate = parseDate(dueMatch?.[1], now);
    if (!dueDate) return null;
    const taskProjectRef = matchNumericRef(segment, /(?:المشروع|مشروع|project)\s*(?:رقم|id|#)?\s*[:=]?\s*(\d+)/iu);
    const priorityText = segment.match(/(?:اولوية|أولوية|priority)\s*[:=]?\s*([\p{L}_-]+)/iu)?.[1];
    const typeText = segment.match(/(?:النوع|نوع|type)\s*[:=]?\s*([\p{L}_-]+)/iu)?.[1];
    const priority = priorityFrom(priorityText);
    const taskType = taskTypeFrom(typeText);
    if (!priority || !taskType) return null;
    return {
      kind: "CREATE_TASK", source: segment,
      title: cleanValue(taskMatch[1].split(/\s+(?:موعد|تاريخ|due|مشروع|project)\s*[:=]?/iu)[0]),
      dueDate, projectRef: taskProjectRef ?? undefined, priority, taskType,
    };
  }

  return null;
}

function commandSegments(message: string): string[] {
  return normalizeDigits(message)
    .replace(/\r/g, "")
    .split(/\n+|[؛;]/)
    .flatMap((segment) => segment.split(LINKED_OPERATION_SEPARATOR))
    .map((segment) => segment.replace(/^\s*(?:[-*•]|\d+[.)-])\s*/, "").trim())
    .filter(Boolean);
}

export interface ParseAssistantResult {
  actions: ParsedAssistantAction[];
  unparsed: string[];
}

export function parseAssistantMessage(message: string, now = new Date()): ParseAssistantResult {
  const actions: ParsedAssistantAction[] = [];
  const unparsed: string[] = [];
  for (const segment of commandSegments(message)) {
    const parsed = parseKeyValueSegment(segment, now) ?? parseFreeTextSegment(segment, now);
    if (parsed) actions.push(parsed);
    else unparsed.push(segment);
  }
  return { actions, unparsed };
}
