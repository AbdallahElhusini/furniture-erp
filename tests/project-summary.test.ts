import assert from "node:assert/strict";
import test from "node:test";
import { summarizeProjectAmounts } from "../src/lib/project-summary.ts";

test("cancelled projects do not inflate project estimates or outstanding balances", () => {
  const result = summarizeProjectAmounts([
    { status: "APPROVED", totalPrice: 12000, totalCost: 6000, amountPaid: 2000 },
    { status: "CANCELLED", totalPrice: 80000, totalCost: 30000, amountPaid: 10000 },
  ]);
  assert.deepEqual(result, { totalRevenue: 12000, totalCosts: 6000, totalCollected: 2000, totalPending: 10000, totalProfit: 6000, profitMargin: "50.0%" });
});

test("an overpaid project cannot erase another project's unpaid balance", () => {
  const result = summarizeProjectAmounts([
    { status: "COMPLETED", totalPrice: 100, totalCost: 50, amountPaid: 200 },
    { status: "APPROVED", totalPrice: 100, totalCost: 50, amountPaid: 0 },
  ]);
  assert.equal(result.totalPending, 100);
  assert.equal(summarizeProjectAmounts([]).profitMargin, "0%");
});
