import assert from "node:assert/strict";
import test from "node:test";
import { parseClientInput, normalizeClientPhone, clientFinancialSummary } from "../src/lib/client-crm.ts";

test("lead can be recorded from a real conversation without invented contact details", () => {
  const client = parseClientInput({ name: "أحمد", brief: "طلب مكتب يتنفذ عند محمود الأبيض" });
  assert.equal(client.stage, "LEAD");
  assert.equal(client.phone, "");
  assert.equal(client.brief, "طلب مكتب يتنفذ عند محمود الأبيض");
});
test("conversion requires usable contact details and editing preserves omitted fields", () => {
  const lead = parseClientInput({ name: "أحمد", company: "شركة أحمد", brief: "مكتب", source: "مكالمة", nextFollowUpAt: "2026-09-14" });
  assert.throws(() => parseClientInput({ stage: "CUSTOMER" }, lead), /رقم الهاتف/);
  const converted = parseClientInput({ stage: "CUSTOMER", phone: "٠١٠ ١٢٣٤-٥٦٧٨" }, lead);
  assert.equal(converted.phone, "01012345678");
  assert.equal(converted.brief, "مكتب");
  assert.equal(converted.source, "مكالمة");
  assert.equal(converted.nextFollowUpAt?.toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(parseClientInput({ nextFollowUpAt: null, brief: "" }, converted).nextFollowUpAt, null);
});
test("CRM validation rejects incorrect dates, invalid stages and dangerous shape mismatches", () => {
  for (const input of [null, [], { name: {} }, { name: "أحمد", stage: "ANYTHING" }, { name: "أحمد", phone: "abc" }, { name: "أحمد", nextFollowUpAt: "2026-02-30" }, { name: "أحمد", email: "bad@email" }]) assert.throws(() => parseClientInput(input));
  assert.equal(normalizeClientPhone("+۲۰ (۱۰) ۱۲۳۴۵۶۷۸"), "+201012345678");
});
test("client outstanding excludes unapproved/cancelled proposals and does not hide another project's debt", () => {
  const totals = clientFinancialSummary([
    { status: "LEAD", totalPrice: 999999, amountPaid: 0 },
    { status: "CANCELLED", totalPrice: 999999, amountPaid: 0 },
    { status: "APPROVED", totalPrice: 12000, amountPaid: 5000 },
    { status: "COMPLETED", totalPrice: 1000, amountPaid: 2000 },
  ]);
  assert.deepEqual(totals, { totalSpent: 13000, totalPaid: 7000, outstandingBalance: 7000 });
});
