import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Finance landing page keeps role guard and exposes the four-step finance workflow', () => {
  const source = readFileSync(new URL('../src/app/finance/page.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("requirePageRole(actor, 'finance')"));
  assert.ok(source.includes('ตรวจสอบรายการ'));
  assert.ok(source.includes('จัดชุดการจ่ายเงิน'));
  assert.ok(source.includes('OT / Payroll'));
  assert.ok(source.includes('Accounting Export'));
  assert.ok(source.includes('href="/finance/payments"'));
  assert.ok(source.includes('href="/finance/payroll"'));
  assert.ok(source.includes('href="/finance/exports"'));
  assert.ok(source.includes('ห้าม Verify / Paid ด้วยตนเอง'));
});
