export const CLIENT_STAGES = ["LEAD", "QUALIFIED", "CUSTOMER", "LOST"] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];
export const CLIENT_STAGE_LABELS: Record<ClientStage, string> = {
  LEAD: "عميل محتمل", QUALIFIED: "متابعة وعرض سعر", CUSTOMER: "عميل فعلي", LOST: "لم يتم الاتفاق",
};

export interface ClientInput {
  name: string;
  phone: string;
  company: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  stage: ClientStage;
  brief: string | null;
  source: string | null;
  nextFollowUpAt: Date | null;
}

export class ClientInputError extends Error {}

export function normalizeClientPhone(value: string): string {
  return value.trim().replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩".indexOf(digit);
    return String(arabic >= 0 ? arabic : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit));
  }).replace(/[\s()\-]/g, "");
}

/** Unknown contact details remain empty; we never fabricate a phone for a lead. */
export function parseClientInput(body: unknown, current?: Partial<ClientInput>): ClientInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ClientInputError("بيانات العميل غير صحيحة.");
  const raw = body as Record<string, unknown>;
  function text(key: keyof ClientInput, max: number, fallback: string | null = null): string | null {
    const value = Object.hasOwn(raw, key) ? raw[key] : current?.[key] ?? fallback;
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string") throw new ClientInputError(`حقل ${key} يجب أن يكون نصاً.`);
    if (value.trim().length > max) throw new ClientInputError(`حقل ${key} أطول من المسموح (${max}).`);
    return value.trim() || null;
  }
  const name = text("name", 200);
  if (!name) throw new ClientInputError("اكتب اسم العميل.");
  const stage = text("stage", 30, "LEAD");
  if (!CLIENT_STAGES.includes(stage as ClientStage)) throw new ClientInputError("مرحلة العميل غير صحيحة.");
  const phone = normalizeClientPhone(text("phone", 80) ?? "");
  if (phone && !/^\+?\d{5,20}$/.test(phone)) throw new ClientInputError("رقم الهاتف يجب أن يتكون من 5 إلى 20 رقماً ويمكن أن يبدأ بـ +.");
  if (stage === "CUSTOMER" && !phone) throw new ClientInputError("أضف رقم الهاتف قبل تحويل السجل إلى عميل فعلي.");
  const email = text("email", 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ClientInputError("البريد الإلكتروني غير صحيح.");
  const followUp = Object.hasOwn(raw, "nextFollowUpAt") ? raw.nextFollowUpAt : current?.nextFollowUpAt;
  let nextFollowUpAt: Date | null = null;
  if (followUp !== null && followUp !== undefined && followUp !== "") {
    if (!(followUp instanceof Date) && (typeof followUp !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(followUp))) {
      throw new ClientInputError("حدد تاريخ متابعة صحيحاً.");
    }
    nextFollowUpAt = new Date(followUp);
    if (Number.isNaN(nextFollowUpAt.getTime()) || (typeof followUp === "string" && followUp.length === 10 && nextFollowUpAt.toISOString().slice(0, 10) !== followUp)) {
      throw new ClientInputError("تاريخ المتابعة غير موجود في التقويم.");
    }
  }
  return {
    name, phone, stage: stage as ClientStage, email, nextFollowUpAt,
    company: text("company", 200), address: text("address", 1000), notes: text("notes", 5000),
    brief: text("brief", 5000), source: text("source", 200),
  };
}

export function clientFinancialSummary(projects: ReadonlyArray<{ status: string; totalPrice: number; amountPaid: number }>) {
  const committed = projects.filter((project) => ["APPROVED", "IN_PRODUCTION", "READY", "INSTALLING", "COMPLETED"].includes(project.status));
  const totalSpent = committed.reduce((sum, project) => sum + project.totalPrice, 0);
  const totalPaid = projects.reduce((sum, project) => sum + project.amountPaid, 0);
  return { totalSpent, totalPaid, outstandingBalance: committed.reduce((sum, project) => sum + Math.max(0, project.totalPrice - project.amountPaid), 0) };
}
