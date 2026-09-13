import { inspectNaturalOrderDraft, normalizeDigits, parseAssistantMessage, type NaturalOrderDraft } from "./parser.ts";

export interface ConversationQuestion {
  field: string;
  text: string;
  suggestions: Array<{ label: string; message: string }>;
}

export interface OrderConversation {
  draft: NaturalOrderDraft;
  questions: ConversationQuestion[];
  compiledMessage: string | null;
}

function amount(value: string): number | undefined {
  const normalized = normalizeDigits(value).trim().replace(/٫/g, ".");
  const match = normalized.match(/^((?:\d+|\d{1,3}(?:[,٬]\d{3})+)(?:\.\d{1,2})?)\s*(ألف|الف|آلاف|الاف|k|جنيه|جنيهات|EGP)?$/iu);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/[,٬]/g, "")) * (/^(?:ألف|الف|آلاف|الاف|k)$/iu.test(match[2] ?? "") ? 1000 : 1);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : undefined;
}

function labelValue(message: string, labels: string): string | undefined {
  const nextLabels = "اسم العميل|العميل|عميل|هاتف|تليفون|موبايل|الكمية|كمية|العدد|عدد|المنتج|منتج|كود|المصنع|مصنع|المورد|مورد|التكلفة للوحدة|تكلفة الوحدة|التكلفة|تكلفة|سعر الوحدة|سعر البيع|البيع|بيع|السعر|سعر|المشروع|مشروع";
  const expression = new RegExp(`(?:^|[\\s|،؛])و?(?:${labels})\\s*[:=]?\\s*(.+?)(?=\\s+و?(?:${nextLabels})(?:\\s|[:=])|[|،؛]|$)`, "iu");
  return message.match(expression)?.[1]?.trim();
}

export function orderQuestions(draft: NaturalOrderDraft): ConversationQuestion[] {
  const questions: ConversationQuestion[] = [];
  if (draft.invalidFields.includes("amountBasis")) questions.push({ field: "amountBasis", text: "ذكرت مبلغًا إجماليًا. عشان ما نضربوش في الكمية مرة تانية، اكتب سعر الوحدة وتكلفة الوحدة صراحةً (مثل: سعر الوحدة: 6000 | تكلفة الوحدة: 3000).", suggestions: [] });
  for (const [field, label, ambiguous] of [["unitCost", "التكلفة", draft.ambiguousCost], ["unitPrice", "سعر البيع", draft.ambiguousPrice]] as const) {
    if (ambiguous !== undefined) questions.push({
      field,
      text: `لما قلت ${label} ${ambiguous}، تقصد ${ambiguous} جنيه ولا ${ambiguous * 1000} جنيه؟`,
      suggestions: [ambiguous * 1000, ambiguous].map((value) => ({ label: `${value.toLocaleString("ar-EG")} جنيه`, message: `${label}: ${value} جنيه` })),
    });
  }
  if (!draft.clientName) questions.push({ field: "clientName", text: "اسم العميل إيه؟", suggestions: [] });
  if (!draft.clientPhone) questions.push({ field: "clientPhone", text: "رقم موبايل العميل إيه؟ هنستخدمه عشان نربط الطلب بالعميل الصحيح.", suggestions: [] });
  if (draft.quantity === undefined) questions.push({ field: "quantity", text: "الطلب كام قطعة؟", suggestions: [{ label: "قطعة واحدة", message: "الكمية: 1" }] });
  if (!draft.productReference) questions.push({ field: "productReference", text: "اسم المنتج أو كوده في الكتالوج إيه؟", suggestions: [] });
  if (draft.invalidFields.some((field) => !["unitCostScale", "unitPriceScale", "amountBasis"].includes(field))) questions.push({ field: "invalid", text: "في رقم غير صالح. اكتب الكمية أو السعر المطلوب تصحيحه مع اسمه.", suggestions: [] });
  return questions;
}

function updateDraft(draft: NaturalOrderDraft, rawMessage: string): NaturalOrderDraft {
  const message = normalizeDigits(rawMessage).trim().replace(/((?:الكمية|كمية|العدد|عدد|سعر الوحدة|سعر البيع|السعر|سعر|التكلفة|تكلفة))\s+(?:إلى|الى|to)\s+/giu, "$1: ");
  const next = { ...draft, invalidFields: [...draft.invalidFields] };
  const expected = orderQuestions(draft)[0]?.field;
  const phoneLabel = labelValue(message, "الهاتف|هاتف|التليفون|تليفون|الموبايل|موبايل|phone");
  const phoneValue = phoneLabel?.replace(/[\s-]/g, "");
  const phone = phoneValue !== undefined
    ? (/^(?:\+?20)?0?1[0125]\d{8}$/.test(phoneValue) ? phoneValue : undefined)
    : message.match(/(?<!\d)(?:\+?20)?0?1[0125]\d{8}(?!\d)/)?.[0];
  if (phone) next.clientPhone = phone;
  else if (/(?:هاتف|تليفون|موبايل)\s*[:=]?/iu.test(message)) next.clientPhone = undefined;
  const quantityWords: Record<string, number> = { واحد: 1, واحدة: 1, "قطعة واحدة": 1, اتنين: 2, اثنين: 2, اثنان: 2, قطعتين: 2, تلاتة: 3, ثلاثة: 3, اربعة: 4, أربعة: 4, خمسة: 5, one: 1, two: 2 };
  const labelledQuantity = labelValue(message, "الكمية|كمية|العدد|عدد|quantity|qty");
  const wordQuantity = quantityWords[(labelledQuantity ?? (expected === "quantity" ? message : "")).trim()];
  const quantityText = (labelledQuantity && /^\d+$/.test(labelledQuantity) ? labelledQuantity : undefined)
    ?? (wordQuantity ? String(wordQuantity) : undefined)
    ?? (expected === "quantity" && /^\d+$/.test(message) ? message : undefined);
  if (quantityText !== undefined) {
    const quantity = Number(quantityText);
    next.invalidFields = next.invalidFields.filter((field) => field !== "quantity");
    if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10_000) next.quantity = quantity;
    else { next.quantity = undefined; next.invalidFields.push("quantity"); }
  } else if (labelledQuantity !== undefined) {
    next.quantity = undefined;
    next.invalidFields = [...next.invalidFields.filter((field) => field !== "quantity"), "quantity"];
  }
  const clientName = labelValue(message, "اسم العميل|العميل|عميل|client");
  if (clientName && !/طلب|مشروع/.test(clientName)) next.clientName = clientName;
  const product = labelValue(message, "المنتج|منتج|كود المنتج|كود|sku|product")
    ?? (/^[A-Za-z]{2,10}(?:-[A-Za-z0-9]{2,})+$/.test(message) ? message : undefined);
  if (product) {
    next.productReference = product;
    if (!draft.projectTitle || draft.projectTitle === `طلب ${draft.productReference}`) next.projectTitle = `طلب ${product}`;
  }
  const supplier = labelValue(message, "المصنع|مصنع|المورد|مورد|supplier");
  if (supplier) next.supplierQuery = supplier;
  const project = labelValue(message, "اسم المشروع|المشروع|مشروع|project");
  if (project) next.projectTitle = project;
  for (const [field, labels, ambiguousField] of [
    ["unitCost", "التكلفة للوحدة|تكلفة الوحدة|التكلفة|تكلفة|علينا|cost", "ambiguousCost"],
    ["unitPrice", "سعر الوحدة|سعر البيع|البيع|بيع|السعر|سعر|price", "ambiguousPrice"],
  ] as const) {
    const labelled = labelValue(message, labels);
    const candidate = labelled ?? (expected === field ? message : undefined);
    const parsed = candidate === undefined ? undefined : amount(candidate);
    if (parsed !== undefined) {
      next[field] = parsed;
      // A reply to an explicit choice establishes the currency amount.
      next[ambiguousField] = undefined;
      next.invalidFields = next.invalidFields.filter((entry) => entry !== field && entry !== `${field}Scale`);
    } else if (labelled !== undefined) {
      next[field] = undefined;
      next[ambiguousField] = undefined;
      next.invalidFields = [...next.invalidFields.filter((entry) => entry !== field && entry !== `${field}Scale`), field];
    }
  }
  if (/سعر الوحدة/iu.test(message) && /(?:تكلفة الوحدة|التكلفة للوحدة)/iu.test(message)
    && next.unitPrice !== undefined && next.unitCost !== undefined) next.invalidFields = next.invalidFields.filter((field) => field !== "amountBasis");
  else if (/(?:إجمالي|اجمالي|الإجمالية|الاجمالية|جملة|total)/iu.test(message)) next.invalidFields = [...new Set([...next.invalidFields, "amountBasis"])];
  return next;
}

export function isConversationReset(message: string): boolean {
  return /(?:^|\s)(?:خلاص\s+)?(?:سيب|الغ|ألغي|الغي|إلغاء|الغي|انسى|انس|تجاهل)\s+(?:الطلب|الأوردر|الاوردر|ده|دا|الموضوع)|(?:ابدأ|ابدا)\s+(?:من جديد|محادثة جديدة)|(?:خلينا|خليني)\s+في\s+عميل\s+(?:تاني|آخر|اخر)|^(?:cancel|never mind|start over)\b/iu.test(message);
}

/** Adds only the field the assistant explicitly asked for, never an inferred value. */
export function contextualizeConversationAnswer(message: string, field: string | undefined): string {
  if (!field || /[:=|\n]|(?:هاتف|تليفون|موبايل|كمية|الكمية|عدد|منتج|كود|مصنع|مورد|تكلفة|التكلفة|سعر|عميل|مشروع|احذف|امسح|عدل|غير|مهمة)/iu.test(message)) return message;
  const labels: Record<string, string> = { unitCost: "التكلفة", unitPrice: "سعر البيع", clientPhone: "هاتف", quantity: "الكمية", productReference: "المنتج", supplierQuery: "المصنع", clientName: "اسم العميل" };
  if (!labels[field]) return message;
  if ((field === "unitCost" || field === "unitPrice") && amount(message) === undefined) return message;
  if (field === "clientPhone" && !/^(?:\+?20)?0?1[0125]\d{8}$/.test(normalizeDigits(message).trim())) return message;
  return `${labels[field]}: ${message}`;
}

export function compileOrderDraft(draft: NaturalOrderDraft): string {
  const safe = (value: string) => value.replace(/[|\r\n]/g, " ").trim();
  return [
    `عميل: ${safe(draft.clientName ?? "")}`,
    `هاتف: ${safe(draft.clientPhone ?? "")}`,
    `مشروع: ${safe(draft.projectTitle ?? `طلب ${draft.productReference}`)}`,
    `منتج: ${safe(draft.productReference ?? "")}`,
    `كمية: ${draft.quantity}`,
    ...(draft.unitPrice === undefined ? [] : [`سعر البيع: ${draft.unitPrice}`]),
    ...(draft.unitCost === undefined ? [] : [`تكلفة: ${draft.unitCost}`]),
    ...(draft.supplierQuery ? [`مصنع: ${safe(draft.supplierQuery)}`] : []),
  ].join(" | ");
}

/** Only folds a single pending order. Batch commands stay with the ordered command compiler. */
export function prepareOrderConversation(messages: string[]): OrderConversation | null {
  let draft: NaturalOrderDraft | null = null;
  for (const message of messages) {
    if (isConversationReset(message)) { draft = null; continue; }
    if (message.includes("\n") || (message.match(/(?:عميل|client|customer)\s*[:=]?/giu)?.length ?? 0) > 1) { draft = null; continue; }
    if (message.includes("|")) {
      const structured = parseAssistantMessage(message);
      if (structured.actions.length > 0 && structured.unparsed.length === 0) { draft = null; continue; }
    }
    const fresh = inspectNaturalOrderDraft(message);
    if (fresh) draft = fresh;
    else if (draft) {
      const draftCorrection = /^(?:عدل|عدّل|خلي|خلّي|غير|غيّر)\s+(?:الكمية|العدد|السعر|سعر|التكلفة|المصنع|المورد|المنتج|الهاتف|العميل)/iu.test(message.trim())
        && !/(?:المشروع|المهمة|أمر التوريد|المورد رقم|العميل رقم)\s*(?:رقم|#)?\s*\d/iu.test(message);
      const unrelatedAction = parseAssistantMessage(message).actions.length > 0
        || /^(?:ضيف|اضف|أضف|سجل|احذف|امسح|عدل|غيّر|غير|مهمة|task|create|delete|remove|update)\s/iu.test(message.trim());
      draft = unrelatedAction && !draftCorrection ? null : updateDraft(draft, message);
    }
  }
  if (!draft) return null;
  const questions = orderQuestions(draft);
  return { draft, questions, compiledMessage: questions.length ? null : compileOrderDraft(draft) };
}

export function describeOrderDraft(draft: NaturalOrderDraft): string {
  return [
    draft.clientName && `العميل ${draft.clientName}`,
    draft.productReference && `طلب ${draft.productReference}`,
    draft.quantity !== undefined && `الكمية ${draft.quantity}`,
    draft.supplierQuery && `التصنيع عند ${draft.supplierQuery}`,
    draft.unitCost !== undefined && `التكلفة ${draft.unitCost}${draft.ambiguousCost === undefined ? " جنيه" : " (محتاجة توضيح)"}`,
    draft.unitPrice !== undefined && `البيع ${draft.unitPrice}${draft.ambiguousPrice === undefined ? " جنيه" : " (محتاج توضيح)"}`,
  ].filter(Boolean).join("، ");
}
