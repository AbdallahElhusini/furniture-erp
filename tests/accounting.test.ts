import test from "node:test";
import assert from "node:assert/strict";
import { money, calendarDate, parseLedgerInput, parseLedgerKey, applyPaidDelta } from "../src/lib/accounting/validation.ts";

test("financial amounts accept clear Arabic or decimal values and reject truncation/ambiguous money", () => {
  assert.equal(money("٦٠٠٠٫٥٠"), 6000.5);
  assert.equal(money("12000.00"), 12000);
  for (const value of ["6000 جنيه", "6k", "6,000", "1e4", "0x100", Infinity, 0, -5, "12.123", true, null, ""]) assert.throws(() => money(value));
});

test("dates and identifiers reject invalid dates and partially numeric ids", () => {
  assert.equal(calendarDate("2026-09-13"), "2026-09-13");
  assert.throws(() => calendarDate("2026-02-30"));
  assert.throws(() => calendarDate("13/09/2026"));
  assert.deepEqual(parseLedgerKey("payment:42"), { source: "payment", id: 42 });
  assert.throws(() => parseLedgerKey("payment:42suffix"));
});

test("receipt/supplier movements require correct links, never silently become general expenses", () => {
  const base = { amount: 6000, date: "2026-09-13", method: "CASH", description: "دفعة تصنيع" };
  assert.throws(() => parseLedgerInput({ ...base, kind: "RECEIPT" }));
  assert.throws(() => parseLedgerInput({ ...base, kind: "SUPPLIER_PAYMENT" }));
  assert.throws(() => parseLedgerInput({ ...base, kind: "EXPENSE", supplierOrderId: 4 }));
  assert.equal(parseLedgerInput({ ...base, kind: "RECEIPT", projectId: 3 }).projectId, 3);
  assert.equal(parseLedgerInput({ ...base, kind: "EXPENSE" }).supplierOrderId, null);
});

test("editing or voiding a payment preserves preexisting unitemized balances", () => {
  assert.equal(applyPaidDelta(6500, 1500, 2000), 7000);
  assert.equal(applyPaidDelta(6500, 1500, 0), 5000);
  assert.equal(applyPaidDelta(0.1, 0, 0.2), 0.3);
  assert.throws(() => applyPaidDelta(10, 100, 0));
});
