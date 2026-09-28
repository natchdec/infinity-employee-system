import test from 'node:test';
import assert from 'node:assert/strict';
import { activeReminders, exceptionInbox, monthlyStatement } from '../src/domain/monthly-summary';

test('monthly statement summarizes operational values without inventing salary data', () => {
  assert.deepEqual(
    monthlyStatement({
      otHours: 18.5,
      otSatang: 420000n,
      mileageMetres: 426400,
      mileageSatang: 341120n,
      expenseSatang: 425000n,
      advanceSatang: 500000n,
      settlementSatang: 75000n,
      leaveDays: 1,
      paymentStates: ['paid', 'unpaid'],
    }),
    {
      otHours: 18.5,
      otSatang: '420000',
      mileageKm: 426.4,
      mileageSatang: '341120',
      expenseSatang: '425000',
      advanceSatang: '500000',
      settlementSatang: '75000',
      leaveDays: 1,
      paymentStatus: 'partial',
    },
  );
});

test('exception inbox keeps unresolved blocking work ahead of review items', () => {
  assert.deepEqual(
    exceptionInbox([
      {
        id: 'review-2',
        kind: 'receipt_missing',
        severity: 'review',
        resolved: false,
      },
      {
        id: 'done',
        kind: 'configuration',
        severity: 'blocking',
        resolved: true,
      },
      {
        id: 'block-1',
        kind: 'mileage_route',
        severity: 'blocking',
        resolved: false,
      },
    ]).map((item) => item.id),
    ['block-1', 'review-2'],
  );
});

test('reminders are due-aware and deduplicated by durable event key', () => {
  const now = new Date('2026-09-28T12:00:00+07:00');
  const result = activeReminders(
    [
      {
        eventKey: 'calendar:user-a:2026-09',
        employeeId: 'user-a',
        kind: 'calendar_review',
        title: 'ตรวจ Calendar Draft',
        href: '/worklog',
        dueAt: new Date('2026-09-28T08:00:00+07:00'),
        completed: false,
      },
      {
        eventKey: 'calendar:user-a:2026-09',
        employeeId: 'user-a',
        kind: 'calendar_review',
        title: 'duplicate',
        href: '/worklog',
        dueAt: new Date('2026-09-28T09:00:00+07:00'),
        completed: false,
      },
      {
        eventKey: 'future',
        employeeId: 'user-a',
        kind: 'settlement_due',
        title: 'ยังไม่ถึงเวลา',
        href: '/trips',
        dueAt: new Date('2026-09-29T08:00:00+07:00'),
        completed: false,
      },
    ],
    now,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0]?.eventKey, 'calendar:user-a:2026-09');
});
