export const LEDGER_KINDS = ["RECEIPT", "SUPPLIER_PAYMENT", "EXPENSE", "OTHER_INCOME"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHECK"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class AccountingError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function money(value: unknown): number {
  const normalized = typeof value === "string"
    ? value.trim().replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/٫/g, ".")
    : value;
  if ((typeof normalized !== "number" && typeof normalized !== "string") || normalized === "" || !/^\d+(?:\.\d{1,2})?$/.test(String(normalized))) {
    throw new AccountingError("أدخل مبلغًا صحيحًا، بحد أقصى رقمين بعد العلامة العشرية.");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new AccountingError("المبلغ يجب أن يكون أكبر من صفر ولا يتجاوز مليار جنيه.");
  return Math.round(amount * 100) / 100;
}

export function roundMoney(amount: number): number { return Math.round((amount + Number.EPSILON) * 100) / 100; }

function optionalId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if ((typeof value !== "string" && typeof value !== "number") || !/^[1-9]\d*$/.test(String(value))) throw new AccountingError("معرّف المشروع أو أمر التوريد غير صحيح.");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AccountingError("معرّف المشروع أو أمر التوريد غير صحيح.");
  return id;
}

function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new AccountingError(`النص يجب ألا يتجاوز ${max} حرفًا.`);
  return value.trim() || null;
}

export function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AccountingError("أدخل تاريخًا صحيحًا بصيغة سنة-شهر-يوم.");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AccountingError("التاريخ غير صحيح.");
  return value;
}

export interface LedgerInput {
  kind: LedgerKind;
  amount: number;
  method: PaymentMethod;
  date: string;
  description: string;
  category: string | null;
  notes: string | null;
  projectId: number | null;
  supplierOrderId: number | null;
}

export function parseLedgerInput(value: unknown): LedgerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccountingError("بيانات الحركة غير صحيحة.");
  const row = value as Record<string, unknown>;
  const kind = row.kind as LedgerKind;
  if (!LEDGER_KINDS.includes(kind)) throw new AccountingError("اختر نوع الحركة.");
  const method = row.method as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) throw new AccountingError("اختر وسيلة دفع صحيحة.");
  const projectId = optionalId(row.projectId);
  const supplierOrderId = optionalId(row.supplierOrderId);
  if (kind === "RECEIPT" && !projectId) throw new AccountingError("اختر مشروع العميل لربط التحصيل بحسابه.");
  if (kind === "SUPPLIER_PAYMENT" && !supplierOrderId) throw new AccountingError("اختر أمر التوريد لربط الدفعة بحساب المصنع.");
  if (kind !== "SUPPLIER_PAYMENT" && supplierOrderId) throw new AccountingError("أمر التوريد يستخدم فقط مع دفعات الموردين.");
  const description = text(row.description, 240) ?? (kind === "RECEIPT" ? "تحصيل من عميل" : "");
  if (!description) throw new AccountingError("اكتب بيان الحركة.");
  return { kind, amount: money(row.amount), method, date: calendarDate(row.date), description, category: text(row.category, 80), notes: text(row.notes, 2000), projectId, supplierOrderId };
}

export function parseLedgerKey(key: unknown): { source: "payment" | "finance"; id: number } {
  const match = typeof key === "string" ? /^(payment|finance):([1-9]\d*)$/.exec(key) : null;
  if (!match || !Number.isSafeInteger(Number(match[2]))) throw new AccountingError("معرّف الحركة غير صحيح.");
  return { source: match[1] as "payment" | "finance", id: Number(match[2]) };
}

export function applyPaidDelta(paid: number, previousAmount: number, nextAmount: number): number {
  const updated = roundMoney(paid - previousAmount + nextAmount);
  if (updated < 0) throw new AccountingError("الرصيد المسجل لا يطابق هذه الحركة. راجع الرصيد السابق قبل التعديل.", 409);
  return updated;
}
