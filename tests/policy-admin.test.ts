import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calendarPolicyPublishSchema,
  currentCalendarPolicy,
  normalizeCalendarPolicyBody,
  type CalendarPolicyAdminView,
} from '../src/server/policy-admin';

test('calendar policy normalization sorts weekdays and deduplicates holidays', () => {
  const input = calendarPolicyPublishSchema.parse({
    effectiveFrom: '2026-10-01',
    workingWeekdays: [5, 1, 3, 2, 4],
    holidays: ['2026-12-31', '2026-10-13', '2026-12-31'],
    workStart: '09:00',
    workEnd: '18:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    timeZone: 'Asia/Bangkok',
  });

  assert.deepEqual(normalizeCalendarPolicyBody(input), {
    workingWeekdays: [1, 2, 3, 4, 5],
    holidays: ['2026-10-13', '2026-12-31'],
    workStart: '09:00',
    workEnd: '18:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    timeZone: 'Asia/Bangkok',
  });
});

test('calendar policy rejects invalid working-hour boundaries', () => {
  const input = calendarPolicyPublishSchema.parse({
    effectiveFrom: '2026-10-01',
    workingWeekdays: [1, 2, 3, 4, 5],
    holidays: [],
    workStart: '18:00',
    workEnd: '09:00',
    lunchStart: null,
    lunchEnd: null,
    timeZone: 'Asia/Bangkok',
  });
  assert.throws(() => normalizeCalendarPolicyBody(input));
});

test('future-effective policy is not reported as current', () => {
  const base = {
    body: {
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [],
      workStart: '09:00',
      workEnd: '18:00',
      lunchStart: '12:00',
      lunchEnd: '13:00',
      timeZone: 'Asia/Bangkok' as const,
    },
    hash: 'hash',
  };
  const history: CalendarPolicyAdminView[] = [
    { ...base, version: 3, effectiveFrom: '2026-11-01' },
    { ...base, version: 2, effectiveFrom: '2026-09-01' },
    { ...base, version: 1, effectiveFrom: '2026-01-01' },
  ];

  assert.equal(currentCalendarPolicy(history, '2026-09-28')?.version, 2);
  assert.equal(currentCalendarPolicy(history, '2025-12-31'), null);
});
