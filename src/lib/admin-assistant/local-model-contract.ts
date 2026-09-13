import {
  normalizeDigits,
  parseAssistantMessage,
  type ParseAssistantResult,
} from "./parser.ts";
import {
  PROJECT_ITEM_STATUSES,
  PROJECT_STATUSES,
  SUPPLIER_ORDER_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type ParsedAssistantAction,
} from "./types.ts";
import {
  getAllowedModelFields,
  MODEL_ENABLED_OPERATION_KINDS,
  OPERATION_CONTRACT,
  OPERATION_KINDS,
} from "./operation-registry.ts";

type JsonRecord = Record<string, unknown>;

const ALLOWED_FIELDS = Object.fromEntries(
  OPERATION_KINDS.map((kind) => [kind, getAllowedModelFields(kind)]),
) as Record<ParsedAssistantAction["kind"], ReadonlySet<string>>;

const MODEL_ENABLED_KINDS = new Set<string>(MODEL_ENABLED_OPERATION_KINDS);
const MODEL_ENVELOPE_FIELDS = new Set(OPERATION_CONTRACT.envelope.required);

const PROJECT_STATUS_EVIDENCE: Record<string, readonly string[]> = {
  LEAD: ["lead", "prospect", "عميل محتمل"],
  INSPECTION: ["inspection", "معاينة"],
  DESIGNING: ["designing", "in design", "قيد التصميم", "تصميم"],
  PENDING_APPROVAL: ["pending_approval", "pending approval", "pending-approval", "بانتظار الاعتماد", "في انتظار الاعتماد"],
  APPROVED: ["approved", "معتمد", "تم الاعتماد"],
  IN_PRODUCTION: ["in_production", "in production", "in-production", "قيد التصنيع"],
  READY: ["ready", "جاهز", "جاهزة"],
  INSTALLING: ["installing", "in installation", "قيد التركيب", "مرحلة التركيب", "تركيب"],
  COMPLETED: ["completed", "complete", "مكتمل", "مكتملة", "منتهي", "منتهى"],
  CANCELLED: ["cancelled", "canceled", "ملغي", "ملغى", "ملغية"],
};

const PRIORITY_EVIDENCE: Record<string, readonly string[]> = {
  LOW: ["low", "منخفض", "منخفضة"],
  MEDIUM: ["medium", "متوسط", "متوسطة"],
  HIGH: ["high", "عالي", "عالية"],
  URGENT: ["urgent", "عاجل", "عاجلة"],
};

const TASK_STATUS_EVIDENCE: Record<string, readonly string[]> = {
  TODO: ["todo", "to do", "new", "جديد", "جديدة"],
  IN_PROGRESS: ["in_progress", "in progress", "in-progress", "قيد التنفيذ", "جاري", "جار"],
  DONE: ["done", "مكتمل", "مكتملة", "تمت"],
};

const TASK_TYPE_EVIDENCE: Record<string, readonly string[]> = {
  SUPPLIER_FOLLOWUP: ["supplier_followup", "supplier followup", "supplier follow-up", "متابعة مورد", "متابعة المورد"],
  DESIGN: ["design", "تصميم"],
  INSTALLATION: ["installation", "تركيب"],
  DELIVERY: ["delivery", "تسليم", "توصيل"],
  INSPECTION: ["inspection", "معاينة"],
  GENERAL: ["general", "عام", "عامة"],
};

const ITEM_STATUS_EVIDENCE: Record<string, readonly string[]> = {
  PENDING: ["pending", "معلق", "معلّق", "قيد الانتظار"],
  ORDERED: ["ordered", "تم الطلب"],
  IN_PRODUCTION: ["in_production", "in production", "in-production", "قيد التصنيع"],
  READY: ["ready", "جاهز", "جاهزة"],
  DELIVERED: ["delivered", "تم التسليم", "تم التوصيل"],
  INSTALLED: ["installed", "تم التركيب"],
};

const SUPPLIER_ORDER_STATUS_EVIDENCE: Record<string, readonly string[]> = {
  PENDING: ["pending", "معلق", "معلّق", "قيد الانتظار"],
  CONFIRMED: ["confirmed", "مؤكد", "مؤكدة"],
  IN_PRODUCTION: ["in_production", "in production", "in-production", "قيد التصنيع"],
  READY: ["ready", "جاهز", "جاهزة"],
  SHIPPED: ["shipped", "مشحون", "مشحونة", "تم الشحن"],
  DELIVERED: ["delivered", "تم التسليم", "تم التوصيل"],
  CANCELLED: ["cancelled", "canceled", "ملغي", "ملغى", "ملغية"],
};

const CLEAR_FIELD_EVIDENCE: Record<string, readonly string[]> = {
  company: ["company", "الشركة", "شركة"],
  email: ["email", "e-mail", "البريد", "الايميل", "الإيميل"],
  address: ["address", "العنوان", "عنوان"],
  notes: ["notes", "note", "الملاحظات", "ملاحظات"],
  estimatedDelivery: ["estimated delivery", "delivery estimate", "موعد التسليم المتوقع", "التسليم المتوقع"],
  description: ["description", "الوصف", "وصف"],
};

const PLACEHOLDER_VALUES = new Set([
  "-", "--", "—", "?", "n/a", "na", "none", "null", "tbd", "unknown",
  "not provided", "غير متاح", "غير معروف", "غير محدد",
]);

const INVALID = Symbol("invalid-local-model-field");
type OptionalText = string | null | undefined | typeof INVALID;
type OptionalNumber = number | undefined | typeof INVALID;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeForGrounding(value: string): string {
  return normalizeDigits(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .trim()
    .replace(/\s+/g, " ");
}

function isWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}\p{M}_]/u.test(value));
}

interface GroundedSpan {
  start: number;
  end: number;
}

function groundedSpansInNormalized(needle: string, haystack: string): GroundedSpan[] {
  if (!needle) return [];
  const spans: GroundedSpan[] = [];
  let offset = haystack.indexOf(needle);
  while (offset >= 0) {
    const before = offset > 0 ? haystack[offset - 1] : undefined;
    const afterOffset = offset + needle.length;
    const after = afterOffset < haystack.length ? haystack[afterOffset] : undefined;
    if (!isWordCharacter(before) && !isWordCharacter(after)) {
      spans.push({ start: offset, end: afterOffset });
    }
    offset = haystack.indexOf(needle, offset + 1);
  }
  return spans;
}

function groundedSpans(value: string, source: string): GroundedSpan[] {
  return groundedSpansInNormalized(normalizeForGrounding(value), normalizeForGrounding(source));
}

function isGrounded(value: string, source: string): boolean {
  return groundedSpans(value, source).length > 0;
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(normalizeForGrounding(value));
}

function hasOnlyAllowedFields(record: JsonRecord, kind: ParsedAssistantAction["kind"]): boolean {
  const allowed = ALLOWED_FIELDS[kind];
  return Object.keys(record).every((key) => allowed.has(key));
}

function requiredText(record: JsonRecord, key: string, source: string): string | null {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) return null;
  const cleaned = value.trim();
  return !isPlaceholder(cleaned) && isGrounded(cleaned, source) ? cleaned : null;
}

function requiredReference(record: JsonRecord, key: string, source: string): string | null {
  const raw = record[key];
  const value = typeof raw === "string"
    ? raw.trim()
    : typeof raw === "number" && Number.isSafeInteger(raw)
      ? String(raw)
      : "";
  return value && !isPlaceholder(value) && isGrounded(value, source) ? value : null;
}

function optionalGroundedText(
  record: JsonRecord,
  key: string,
  source: string,
  nullable = false,
): OptionalText {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (value === null) {
    return nullable && hasExplicitClearIntent(source, key) ? null : INVALID;
  }
  if (typeof value !== "string" || !value.trim()) return INVALID;
  const cleaned = value.trim();
  return !isPlaceholder(cleaned) && isGrounded(cleaned, source) ? cleaned : INVALID;
}

function hasExplicitClearIntent(source: string, key: string): boolean {
  const normalized = normalizeForGrounding(source);
  const clearWords = [
    "clear", "remove", "delete", "erase", "unset",
    "امسح", "احذف", "ازل", "أزل", "إزالة", "افرغ", "أفرغ",
    "وامسح", "واحذف", "وازال", "وأزال", "وازاله", "وإزالة", "وافرغ", "وأفرغ",
    "خلي فارغ", "وخلي فارغ", "خليه فاضي", "وخليه فاضي", "بدون", "وبدون",
  ];
  const fields = CLEAR_FIELD_EVIDENCE[key] ?? [key];
  return clearWords.some((clearWord) => {
    const clearSpans = groundedSpansInNormalized(normalizeForGrounding(clearWord), normalized);
    return fields.some((field) => {
      const fieldSpans = groundedSpansInNormalized(normalizeForGrounding(field), normalized);
      return clearSpans.some((clearSpan) => fieldSpans.some((fieldSpan) => {
        const gap = Math.max(
          0,
          fieldSpan.start - clearSpan.end,
          clearSpan.start - fieldSpan.end,
        );
        return gap <= 32;
      }));
    });
  });
}

function integerQuantity(record: JsonRecord, source: string): number | null {
  const value = record.quantity;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 10_000) return null;
  const quantity = value as number;
  const normalized = normalizeDigits(source);
  return new RegExp(`(^|\\D)${quantity}(?!\\d)`, "u").test(normalized) ? quantity : null;
}

function optionalGroundedMoney(record: JsonRecord, key: string, source: string): OptionalNumber {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    return INVALID;
  }
  const normalized = normalizeDigits(source);
  const explicitAmounts = normalized.match(/(?<!\d)(?:\d{1,3}(?:[\s,٬]\d{3})+|\d+)(?:\.\d{1,2})?(?!\d)/gu) ?? [];
  return explicitAmounts.some((amount) => (
    Number(amount.replace(/[\s,٬]/g, "")) === value
  )) ? value : INVALID;
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T : null;
}

function enumIsGrounded(value: string, source: string, evidence: Record<string, readonly string[]>): boolean {
  return (evidence[value] ?? [value]).some((alias) => isGrounded(alias, source));
}

function canonicalPart(label: string, value: string | number | null | undefined): string | null {
  if (value === undefined) return null;
  return `${label}: ${value === null ? "مسح" : value}`;
}

function canonicalCommand(parts: Array<string | null>): string {
  return parts.filter((part): part is string => part !== null).join(" | ");
}

function parseCanonical(
  command: string,
  expectedKind: ParsedAssistantAction["kind"],
  now: Date,
): ParsedAssistantAction | null {
  const result = parseAssistantMessage(command, now);
  const action = result.unparsed.length === 0 && result.actions.length === 1 ? result.actions[0] : null;
  return action?.kind === expectedKind ? action : null;
}

function isInvalid(...values: Array<OptionalText | OptionalNumber>): boolean {
  return values.some((value) => value === INVALID);
}

function hasPatch(...values: unknown[]): boolean {
  return values.some((value) => value !== undefined && value !== INVALID);
}

function actionIdentity(action: ParsedAssistantAction): string {
  const stable = { ...action } as Record<string, unknown>;
  delete stable.source;
  return JSON.stringify(stable);
}

export function validateLocalModelCandidate(
  candidate: unknown,
  source: string,
  now = new Date(),
): ParsedAssistantAction | null {
  if (!isRecord(candidate) || typeof candidate.kind !== "string") return null;
  const kind = candidate.kind as ParsedAssistantAction["kind"];
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_FIELDS, kind) || !hasOnlyAllowedFields(candidate, kind)) return null;

  if (kind === "CREATE_CLIENT") {
    const name = requiredText(candidate, "name", source);
    const phone = requiredText(candidate, "phone", source);
    const company = optionalGroundedText(candidate, "company", source);
    const notes = optionalGroundedText(candidate, "notes", source);
    if (!name || !phone || isInvalid(company, notes)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("عميل", name), canonicalPart("هاتف", phone),
      canonicalPart("شركة", company as string | undefined), canonicalPart("ملاحظات", notes as string | undefined),
    ]), kind, now);
  }

  if (kind === "CREATE_ORDER_BUNDLE") {
    const clientName = requiredText(candidate, "clientName", source);
    const clientPhone = requiredText(candidate, "clientPhone", source);
    const projectTitle = requiredText(candidate, "projectTitle", source);
    const productSku = requiredText(candidate, "productSku", source);
    const quantity = integerQuantity(candidate, source);
    const unitPrice = optionalGroundedMoney(candidate, "unitPrice", source);
    const unitCost = optionalGroundedMoney(candidate, "unitCost", source);
    const supplierQuery = optionalGroundedText(candidate, "supplierQuery", source);
    const clientCompany = optionalGroundedText(candidate, "clientCompany", source);
    const clientEmail = optionalGroundedText(candidate, "clientEmail", source);
    const clientAddress = optionalGroundedText(candidate, "clientAddress", source);
    const clientNotes = optionalGroundedText(candidate, "clientNotes", source);
    const projectNotes = optionalGroundedText(candidate, "projectNotes", source);
    const estimatedDelivery = optionalGroundedText(candidate, "estimatedDelivery", source);
    const itemNotes = optionalGroundedText(candidate, "itemNotes", source);
    const projectPriority = enumValue(candidate.projectPriority, TASK_PRIORITIES);
    if (!clientName || !clientPhone || !projectTitle || !productSku || quantity === null
      || isInvalid(unitPrice, unitCost, supplierQuery, clientCompany, clientEmail, clientAddress, clientNotes, projectNotes, estimatedDelivery, itemNotes)
      || (candidate.projectPriority !== undefined && (!projectPriority || !enumIsGrounded(projectPriority, source, PRIORITY_EVIDENCE)))) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("عميل", clientName), canonicalPart("هاتف", clientPhone), canonicalPart("مشروع", projectTitle),
      canonicalPart("كود", productSku), canonicalPart("كمية", quantity),
      canonicalPart("سعر البيع", unitPrice as number | undefined),
      canonicalPart("سعر التكلفة", unitCost as number | undefined),
      canonicalPart("مصنع", supplierQuery as string | undefined),
      canonicalPart("شركة العميل", clientCompany as string | undefined),
      canonicalPart("بريد العميل", clientEmail as string | undefined),
      canonicalPart("عنوان العميل", clientAddress as string | undefined),
      canonicalPart("ملاحظات العميل", clientNotes as string | undefined),
      canonicalPart("أولوية المشروع", projectPriority ?? undefined),
      canonicalPart("ملاحظات المشروع", projectNotes as string | undefined),
      canonicalPart("موعد التسليم", estimatedDelivery as string | undefined),
      canonicalPart("ملاحظات المنتج", itemNotes as string | undefined),
    ]), kind, now);
  }

  if (kind === "UPDATE_PROJECT_STATUS") {
    const projectRef = requiredReference(candidate, "projectRef", source);
    const status = enumValue(candidate.status, PROJECT_STATUSES);
    if (!projectRef || !status || !enumIsGrounded(status, source, PROJECT_STATUS_EVIDENCE)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("مشروع", projectRef), canonicalPart("حالة", status),
    ]), kind, now);
  }

  if (kind === "CREATE_TASK") {
    const title = requiredText(candidate, "title", source);
    const dueDateText = requiredText(candidate, "dueDateText", source);
    const projectRef = candidate.projectRef === undefined ? undefined : requiredReference(candidate, "projectRef", source);
    const description = optionalGroundedText(candidate, "description", source);
    const priority = enumValue(candidate.priority, TASK_PRIORITIES);
    const taskType = enumValue(candidate.taskType, TASK_TYPES);
    if (!title || !dueDateText || !priority || !taskType || projectRef === null || isInvalid(description)) return null;
    if (
      !enumIsGrounded(priority, source, PRIORITY_EVIDENCE)
      || !enumIsGrounded(taskType, source, TASK_TYPE_EVIDENCE)
    ) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("مهمة", title), canonicalPart("موعد", dueDateText),
      canonicalPart("مشروع", projectRef), canonicalPart("أولوية", priority),
      canonicalPart("نوع", taskType), canonicalPart("وصف", description as string | undefined),
    ]), kind, now);
  }

  if (kind === "ADD_PROJECT_ITEM") {
    const projectRef = requiredReference(candidate, "projectRef", source);
    const productSku = requiredText(candidate, "productSku", source);
    const quantity = integerQuantity(candidate, source);
    const notes = optionalGroundedText(candidate, "notes", source);
    if (!projectRef || !productSku || quantity === null || isInvalid(notes)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("مشروع", projectRef), canonicalPart("كود", productSku),
      canonicalPart("كمية", quantity), canonicalPart("ملاحظات", notes as string | undefined),
    ]), kind, now);
  }

  if (kind === "UPDATE_CLIENT") {
    const clientRef = requiredReference(candidate, "clientRef", source);
    const name = optionalGroundedText(candidate, "name", source);
    const phone = optionalGroundedText(candidate, "phone", source);
    const company = optionalGroundedText(candidate, "company", source, true);
    const email = optionalGroundedText(candidate, "email", source, true);
    const address = optionalGroundedText(candidate, "address", source, true);
    const notes = optionalGroundedText(candidate, "notes", source, true);
    if (!clientRef || isInvalid(name, phone, company, email, address, notes) || !hasPatch(name, phone, company, email, address, notes)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("عميل", clientRef),
      canonicalPart("اسم", name as string | undefined), canonicalPart("هاتف", phone as string | undefined),
      canonicalPart("شركة", company as string | null | undefined), canonicalPart("بريد", email as string | null | undefined),
      canonicalPart("عنوان", address as string | null | undefined), canonicalPart("ملاحظات", notes as string | null | undefined),
    ]), kind, now);
  }

  if (kind === "DELETE_CLIENT") {
    const clientRef = requiredReference(candidate, "clientRef", source);
    return clientRef ? parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("عميل", clientRef),
    ]), kind, now) : null;
  }

  if (kind === "UPDATE_PROJECT") {
    const projectRef = requiredReference(candidate, "projectRef", source);
    const title = optionalGroundedText(candidate, "title", source);
    const notes = optionalGroundedText(candidate, "notes", source, true);
    const estimatedDelivery = optionalGroundedText(candidate, "estimatedDelivery", source, true);
    const status = candidate.status === undefined ? undefined : enumValue(candidate.status, PROJECT_STATUSES);
    const priority = candidate.priority === undefined ? undefined : enumValue(candidate.priority, TASK_PRIORITIES);
    if (!projectRef || isInvalid(title, notes, estimatedDelivery)
      || (candidate.status !== undefined && (!status || !enumIsGrounded(status, source, PROJECT_STATUS_EVIDENCE)))
      || (candidate.priority !== undefined && (!priority || !enumIsGrounded(priority, source, PRIORITY_EVIDENCE)))
      || !hasPatch(title, notes, estimatedDelivery, status, priority)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("مشروع", projectRef), canonicalPart("عنوان المشروع", title as string | undefined),
      canonicalPart("حالة", status), canonicalPart("أولوية", priority), canonicalPart("ملاحظات", notes as string | null | undefined),
      canonicalPart("موعد التسليم", estimatedDelivery as string | null | undefined),
    ]), kind, now);
  }

  if (kind === "DELETE_PROJECT") {
    const projectRef = requiredReference(candidate, "projectRef", source);
    return projectRef ? parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("مشروع", projectRef),
    ]), kind, now) : null;
  }

  if (kind === "UPDATE_PROJECT_ITEM") {
    const projectRef = requiredReference(candidate, "projectRef", source);
    const productSku = requiredText(candidate, "productSku", source);
    const quantity = candidate.quantity === undefined ? undefined : integerQuantity(candidate, source);
    const status = candidate.status === undefined ? undefined : enumValue(candidate.status, PROJECT_ITEM_STATUSES);
    const notes = optionalGroundedText(candidate, "notes", source, true);
    if (!projectRef || !productSku || isInvalid(notes)
      || (candidate.quantity !== undefined && quantity === null)
      || (candidate.status !== undefined && (!status || !enumIsGrounded(status, source, ITEM_STATUS_EVIDENCE)))
      || !hasPatch(quantity, status, notes)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("مشروع", projectRef), canonicalPart("كود", productSku),
      canonicalPart("كمية", quantity ?? undefined), canonicalPart("حالة", status),
      canonicalPart("ملاحظات", notes as string | null | undefined),
    ]), kind, now);
  }

  if (kind === "REMOVE_PROJECT_ITEM") {
    const projectRef = requiredReference(candidate, "projectRef", source);
    const productSku = requiredText(candidate, "productSku", source);
    return projectRef && productSku ? parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("مشروع", projectRef), canonicalPart("كود", productSku),
    ]), kind, now) : null;
  }

  if (kind === "UPDATE_TASK") {
    const taskRef = requiredReference(candidate, "taskRef", source);
    const title = optionalGroundedText(candidate, "title", source);
    const description = optionalGroundedText(candidate, "description", source, true);
    if (candidate.dueDate !== undefined && candidate.dueDateText !== undefined) return null;
    const dateKey = candidate.dueDateText !== undefined ? "dueDateText" : "dueDate";
    const dueDate = optionalGroundedText(candidate, dateKey, source);
    const status = candidate.status === undefined ? undefined : enumValue(candidate.status, TASK_STATUSES);
    const priority = candidate.priority === undefined ? undefined : enumValue(candidate.priority, TASK_PRIORITIES);
    const taskType = candidate.taskType === undefined ? undefined : enumValue(candidate.taskType, TASK_TYPES);
    if (!taskRef || isInvalid(title, dueDate, description)
      || (candidate.status !== undefined && (!status || !enumIsGrounded(status, source, TASK_STATUS_EVIDENCE)))
      || (candidate.priority !== undefined && (!priority || !enumIsGrounded(priority, source, PRIORITY_EVIDENCE)))
      || (candidate.taskType !== undefined && (!taskType || !enumIsGrounded(taskType, source, TASK_TYPE_EVIDENCE)))
      || !hasPatch(title, dueDate, description, status, priority, taskType)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("مهمة", taskRef), canonicalPart("عنوان", title as string | undefined),
      canonicalPart("موعد", dueDate as string | undefined), canonicalPart("حالة", status),
      canonicalPart("أولوية", priority), canonicalPart("نوع", taskType),
      canonicalPart("وصف", description as string | null | undefined),
    ]), kind, now);
  }

  if (kind === "DELETE_TASK") {
    const taskRef = requiredReference(candidate, "taskRef", source);
    return taskRef ? parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("مهمة", taskRef),
    ]), kind, now) : null;
  }

  if (kind === "UPDATE_SUPPLIER_ORDER_STATUS") {
    const orderRef = requiredReference(candidate, "orderRef", source);
    const status = enumValue(candidate.status, SUPPLIER_ORDER_STATUSES);
    if (!orderRef || !status || !enumIsGrounded(status, source, SUPPLIER_ORDER_STATUS_EVIDENCE)) return null;
    return parseCanonical(canonicalCommand([
      canonicalPart("عملية", kind), canonicalPart("order_ref", orderRef), canonicalPart("حالة", status),
    ]), kind, now);
  }

  return null;
}

export function validateLocalModelEnvelope(
  envelope: unknown,
  source: string,
  now = new Date(),
): ParseAssistantResult | null {
  if (!isRecord(envelope) || !Array.isArray(envelope.actions) || !Array.isArray(envelope.unparsed)) return null;
  if (
    (!OPERATION_CONTRACT.envelope.additionalProperties
      && Object.keys(envelope).some((key) => !MODEL_ENVELOPE_FIELDS.has(key)))
    || envelope.actions.length > OPERATION_CONTRACT.envelope.maxActions
    || envelope.unparsed.length > OPERATION_CONTRACT.envelope.maxUnparsed
  ) return null;
  if (!envelope.unparsed.every((line) => (
    typeof line === "string"
    && line.length <= OPERATION_CONTRACT.envelope.maxUnparsedItemLength
    && Boolean(line.trim())
    && isGrounded(line, source)
  ))) return null;
  const validated: ParsedAssistantAction[] = [];
  for (const candidate of envelope.actions) {
    // The candidate validator also supports deterministic-only operations so
    // their field rules stay centralized.  The remote-model envelope boundary
    // is stricter: a compromised or stale model service cannot opt itself into
    // high-risk operations that are disabled in the active contract.
    if (!isRecord(candidate) || typeof candidate.kind !== "string" || !MODEL_ENABLED_KINDS.has(candidate.kind)) {
      return null;
    }
    const action = validateLocalModelCandidate(candidate, source, now);
    if (!action) return null;
    validated.push(action);
  }
  if (validated.length === 0 && envelope.unparsed.length === 0) return null;
  const unique = new Map(validated.map((action) => [actionIdentity(action), action] as const));
  return {
    actions: [...unique.values()],
    unparsed: envelope.unparsed.map((line) => (line as string).trim()),
  };
}
