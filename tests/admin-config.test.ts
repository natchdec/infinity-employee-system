import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvalRuleRows,
  normalizeAdminRoles,
  wouldCreateReportingCycle,
} from '../src/server/admin-config';

test('employee role is mandatory and owner/head always receives head role', () => {
  assert.deepEqual(normalizeAdminRoles(['finance'], false), ['employee', 'finance']);
  assert.deepEqual(normalizeAdminRoles(['admin'], true), ['employee', 'head', 'admin']);
});

test('reporting line cycle detection rejects direct and transitive loops', () => {
  const edges = new Map<string, string>([
    ['b', 'c'],
    ['c', 'd'],
  ]);
  assert.equal(wouldCreateReportingCycle(edges, 'a', 'b'), false);

  const transitive = new Map<string, string>([
    ['b', 'c'],
    ['c', 'a'],
  ]);
  assert.equal(wouldCreateReportingCycle(transitive, 'a', 'b'), true);
  assert.equal(wouldCreateReportingCycle(new Map(), 'a', 'a'), true);
});

test('approval matrix preserves company routing invariants', () => {
  const rows = approvalRuleRows();
  const byKind = Object.fromEntries(rows.map((row) => [row.kind, row]));
  assert.equal(byKind.leave?.manager, 'Line Head');
  assert.equal(byKind.ot?.destination, 'Payroll Queue');
  assert.equal(byKind.expense?.finance, 'Finance Verify');
  assert.equal(byKind.advance?.finance, 'Finance Verify');
  assert.equal(byKind.trip?.finance, 'ไม่ใช้');
});
