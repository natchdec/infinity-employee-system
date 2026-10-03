import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/domain/core';
import {
  transitionMonthlyPeriod,
  validateAdjustment,
  validateApprovalDelegation,
} from '../src/domain/monthly-operations';

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (error: unknown) => error instanceof DomainError && error.code === code);

test('monthly closing is explicit and locked periods cannot be silently reopened', () => {
  assert.equal(transitionMonthlyPeriod('open', 'closing'), 'closing');
  assert.equal(transitionMonthlyPeriod('closing', 'locked'), 'locked');
  assert.equal(transitionMonthlyPeriod('closing', 'open'), 'open');
  rejects(() => transitionMonthlyPeriod('open', 'locked'), 'MONTHLY_PERIOD_TRANSITION_INVALID');
  rejects(() => transitionMonthlyPeriod('locked', 'open'), 'MONTHLY_PERIOD_TRANSITION_INVALID');
});

test('approval delegation forbids self delegation and invalid effective dates', () => {
  assert.deepEqual(
    validateApprovalDelegation({
      delegatorId: 'head-a',
      delegateId: 'head-b',
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-10',
    }),
    {
      delegatorId: 'head-a',
      delegateId: 'head-b',
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-10',
    },
  );
  rejects(
    () =>
      validateApprovalDelegation({
        delegatorId: 'head-a',
        delegateId: 'head-a',
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-10',
      }),
    'DELEGATION_SELF_FORBIDDEN',
  );
  rejects(
    () =>
      validateApprovalDelegation({
        delegatorId: 'head-a',
        delegateId: 'head-b',
        effectiveFrom: '2026-10-11',
        effectiveTo: '2026-10-10',
      }),
    'DELEGATION_DATE_RANGE_INVALID',
  );
});

test('adjustments require a linked source, target month, reason and explicit delta', () => {
  const result = validateAdjustment({
    sourceType: 'request',
    sourceId: 'request-1',
    sourceRound: 1,
    targetMonth: '2026-10',
    reason: ' Missing OT from locked September ',
    delta: { otHours: 2 },
  });
  assert.equal(result.reason, 'Missing OT from locked September');
  rejects(
    () =>
      validateAdjustment({
        sourceType: 'request',
        sourceId: 'request-1',
        targetMonth: '2026-10',
        reason: 'Correction',
        delta: {},
      }),
    'ADJUSTMENT_DELTA_REQUIRED',
  );
});
