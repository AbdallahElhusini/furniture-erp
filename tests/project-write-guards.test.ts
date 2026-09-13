import assert from 'node:assert/strict';
import test from 'node:test';
import { hasProjectFinancialHistory, projectMoney } from '../src/lib/project-write-guards.ts';

test('project monetary updates reject truncation, negative values and invalid representations', () => {
  for (const value of ['12abc', '1,5', -1, Infinity, null, true, '', 1e20]) assert.throws(() => projectMoney(value));
  assert.equal(projectMoney('١٢٠٠٠٫٥٠'), 12000.5);
  assert.equal(projectMoney(0), 0);
});

test('project deletion preserves receipts, outgoing ledger and opening balances', () => {
  const empty = { amountPaid: 0, _count: { payments: 0, financeEntries: 0 }, supplierOrders: [] };
  assert.equal(hasProjectFinancialHistory(empty), false);
  assert.equal(hasProjectFinancialHistory({ ...empty, amountPaid: 1 }), true);
  assert.equal(hasProjectFinancialHistory({ ...empty, _count: { payments: 1, financeEntries: 0 } }), true);
  assert.equal(hasProjectFinancialHistory({ ...empty, _count: { payments: 0, financeEntries: 1 } }), true);
  assert.equal(hasProjectFinancialHistory({ ...empty, supplierOrders: [{ amountPaid: 1 }] }), true);
});
