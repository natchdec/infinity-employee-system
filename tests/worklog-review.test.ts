import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectWorklogConflicts,
  planDailyOnsiteRoute,
  sourceChangeTransition,
} from '../src/domain/worklog-review';

test('overlapping OT calendar items are raised for employee review', () => {
  const conflicts = detectWorklogConflicts([
    {
      id: 'ot-a',
      intent: 'ot',
      localStart: '2026-09-28T18:00:00',
      localEnd: '2026-09-28T20:00:00',
    },
    {
      id: 'ot-b',
      intent: 'ot',
      localStart: '2026-09-28T19:30:00',
      localEnd: '2026-09-28T21:00:00',
    },
  ]);
  assert.deepEqual(conflicts, [{ code: 'OT_OVERLAP', itemIds: ['ot-a', 'ot-b'] }]);
});

test('touching OT calendar items do not double count as overlap', () => {
  assert.deepEqual(
    detectWorklogConflicts([
      {
        id: 'ot-a',
        intent: 'ot',
        localStart: '2026-09-28T18:00:00',
        localEnd: '2026-09-28T19:00:00',
      },
      {
        id: 'ot-b',
        intent: 'ot',
        localStart: '2026-09-28T19:00:00',
        localEnd: '2026-09-28T20:00:00',
      },
    ]),
    [],
  );
});

test('same-day onsite events are surfaced as a multi-stop review conflict', () => {
  assert.deepEqual(
    detectWorklogConflicts([
      {
        id: 'onsite-b',
        intent: 'onsite',
        localStart: '2026-09-28T13:00:00',
        localEnd: '2026-09-28T14:00:00',
        locationLabel: 'Customer B',
      },
      {
        id: 'onsite-a',
        intent: 'onsite',
        localStart: '2026-09-28T09:00:00',
        localEnd: '2026-09-28T10:00:00',
        locationLabel: 'Customer A',
      },
    ]),
    [{ code: 'ONSITE_MULTI_STOP_REVIEW', itemIds: ['onsite-a', 'onsite-b'] }],
  );
});

test('same-day onsite visits are ordered into one office round trip and multi-stop requires review', () => {
  assert.deepEqual(
    planDailyOnsiteRoute([
      {
        itemId: 'b',
        localStart: '2026-09-28T13:00:00',
        locationLabel: 'Customer B',
      },
      {
        itemId: 'a',
        localStart: '2026-09-28T09:00:00',
        locationLabel: 'Customer A',
      },
    ]),
    {
      date: '2026-09-28',
      origin: 'office',
      destination: 'office',
      stops: [
        { itemId: 'a', locationLabel: 'Customer A' },
        { itemId: 'b', locationLabel: 'Customer B' },
      ],
      needsReview: true,
    },
  );
});

test('calendar source changes after submit never mutate the submitted request', () => {
  assert.deepEqual(sourceChangeTransition('submitted', false), {
    state: 'submitted',
    exceptionCode: 'SOURCE_CHANGED_AFTER_SUBMIT',
    immutableRequest: true,
  });
  assert.deepEqual(sourceChangeTransition('confirmed', true), {
    state: 'exception',
    exceptionCode: 'SOURCE_CHANGED_REVIEW',
    immutableRequest: false,
  });
  assert.deepEqual(sourceChangeTransition('ignored', true), {
    state: 'ignored',
    exceptionCode: null,
    immutableRequest: false,
  });
});
