export class ProjectWriteError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function projectMoney(value: unknown): number {
  const normalized = typeof value === "string" ? value.trim().replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/٫/g, ".") : value;
  if ((typeof normalized !== "string" && typeof normalized !== "number") || !/^\d+(?:\.\d{1,2})?$/.test(String(normalized))) throw new ProjectWriteError("المبلغ غير صحيح؛ استخدم رقمًا واضحًا بحد أقصى خانتين عشريتين.");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) throw new ProjectWriteError("المبلغ خارج النطاق المسموح.");
  return amount;
}

export function hasProjectFinancialHistory(project: {
  amountPaid: number;
  _count: { payments: number; financeEntries: number };
  supplierOrders: Array<{ amountPaid: number }>;
}): boolean {
  return project.amountPaid !== 0 || project._count.payments > 0 || project._count.financeEntries > 0 || project.supplierOrders.some((order) => order.amountPaid !== 0);
}
