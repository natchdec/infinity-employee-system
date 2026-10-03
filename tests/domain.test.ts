import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DomainError,
  money,
  formatMoney,
  roundRatio,
  metres,
  fingerprint,
  requireIndependentFinance,
  requireIndependentPayer,
  requireRevision,
  csv,
} from '../src/domain/core';
import {
  isoDate,
  bangkokDate,
  payrollCutoff,
  payrollAssignment,
  settlementDueDate,
  settlementState,
} from '../src/domain/calendar';
import {
  calculateOT,
  calculateMileage,
  calculatePerDiem,
  calculateSettlement,
  calculateLeave,
} from '../src/domain/calculations';
import { selectPolicy, validateLegalFloors, type VersionedPolicy } from '../src/domain/policy';
import {
  calendar,
  otPolicy,
  leavePolicy,
  mileagePolicy,
  perDiemPolicy,
  finance,
  employee,
} from './fixtures';

const rejects = (fn: () => unknown, code: string) =>
  assert.throws(fn, (error: unknown) => error instanceof DomainError && error.code === code);

test('decimal THB uses exact satang and formats without floating point', () => {
  assert.equal(money('428.10'), 42810n);
  assert.equal(money('0.01'), 1n);
  assert.equal(formatMoney(2000000n), '20,000.00');
  assert.equal(formatMoney(-240000n), '-2,400.00');
});
for (const invalid of ['1e3', '1.001', '-1', 'NaN', '01', '', '1,000', ' 12']) {
  test(`reject unsafe money ${JSON.stringify(invalid)}`, () =>
    rejects(() => money(invalid), 'INVALID_MONEY'));
}
test('rational rounding is half-up only once', () => {
  assert.equal(roundRatio(1n, 2n), 1n);
  assert.equal(roundRatio(1n, 3n), 0n);
  assert.equal(roundRatio(5n, 2n), 3n);
});
test('km parsing retains exact integer metres', () => {
  assert.equal(metres('55.123'), 55123);
  rejects(() => metres('0.0001'), 'INVALID_DISTANCE');
});
test('canonical input hashes ignore object key order but retain value differences', () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});
test('CSV formula injection is neutralized and quotes escaped', () => {
  assert.match(csv([['=HYPERLINK("x")', 'normal']]), /'=HYPERLINK/);
  assert.match(csv([['a"b']]), /a""b/);
});
test('Finance and Admin cannot verify/pay their own claim', () =>
  rejects(() => requireIndependentFinance(finance, finance.id), 'FINANCE_CONFLICT_OF_INTEREST'));
test('another Finance actor can verify a claim', () =>
  assert.doesNotThrow(() => requireIndependentFinance(finance, employee.id)));
test('employee cannot impersonate Finance', () =>
  rejects(() => requireIndependentFinance(employee, 'other'), 'FORBIDDEN'));
test('Finance Payer must be different from both owner and Finance Verifier', () => {
  const payer = {
    ...finance,
    roles: ['employee', 'finance', 'finance_payer'] as ('employee' | 'finance' | 'finance_payer')[],
  };
  rejects(
    () => requireIndependentPayer(payer, payer.id, employee.id),
    'FINANCE_CONFLICT_OF_INTEREST',
  );
  rejects(() => requireIndependentPayer(payer, employee.id, payer.id), 'PAYMENT_VERIFIER_CONFLICT');
  assert.doesNotThrow(() => requireIndependentPayer(payer, employee.id, 'another-finance-id'));
});
test('stale optimistic revision is a conflict', () =>
  rejects(() => requireRevision(3, 2), 'REVISION_CONFLICT'));
test('invalid calendar dates are rejected', () => {
  rejects(() => isoDate('2026-02-30'), 'INVALID_DATE');
  assert.equal(isoDate('2028-02-29'), '2028-02-29');
});
test('Bangkok date crosses midnight independently of device timezone', () =>
  assert.equal(bangkokDate(new Date('2026-09-23T17:00:00Z')), '2026-09-24'));
test('normal cutoff excludes exactly the start of the 24th in Bangkok', () =>
  assert.equal(payrollCutoff('2026-09', calendar).toISOString(), '2026-09-23T17:00:00.000Z'));
test('Sunday cutoff closes after the preceding Friday', () =>
  assert.equal(payrollCutoff('2026-05', calendar).toISOString(), '2026-05-22T17:00:00.000Z'));
test('company holidays change the centralized operational cutoff', () =>
  assert.equal(
    payrollCutoff('2026-05', { ...calendar, holidays: ['2026-05-22'] }).toISOString(),
    '2026-05-21T17:00:00.000Z',
  ));
test('late approval moves to next payroll cycle at equality boundary', () => {
  const before = payrollAssignment(new Date('2026-09-23T16:59:59Z'), '2026-09-22', () => calendar);
  const at = payrollAssignment(new Date('2026-09-23T17:00:00Z'), '2026-09-22', () => calendar);
  assert.equal(before.month, '2026-09');
  assert.equal(at.month, '2026-10');
});
test('closed cycle is skipped and year rollover is safe', () => {
  assert.equal(
    payrollAssignment(new Date('2026-12-24T00:00:00Z'), '2026-12-22', () => calendar).month,
    '2027-01',
  );
  assert.equal(
    payrollAssignment(
      new Date('2026-09-20T00:00:00Z'),
      '2026-09-18',
      () => calendar,
      undefined,
      new Set(['2026-09']),
    ).month,
    '2026-10',
  );
});
const wage = { monthlySatang: '3000000', normalDailyHours: 8, eligibility: 'eligible' as const };
test('OT is policy driven and supports half-hour increments', () => {
  const result = calculateOT(
    '2026-09-22',
    [{ categoryId: 'weekday_ot', hours: 3 }],
    wage,
    otPolicy,
    calendar,
  );
  assert.equal(result.totalSatang, '56250');
  assert.equal(result.totalHours, 3);
  const halfHour = calculateOT(
    '2026-09-22',
    [{ categoryId: 'weekday_ot', hours: 1.5 }],
    wage,
    otPolicy,
    calendar,
  );
  assert.equal(halfHour.totalSatang, '28125');
  assert.equal(halfHour.totalHours, 1.5);
});
test('OT rejects increments smaller than half an hour', () =>
  rejects(
    () =>
      calculateOT(
        '2026-09-22',
        [{ categoryId: 'weekday_ot', hours: 1.25 }],
        wage,
        otPolicy,
        calendar,
      ),
    'HALF_HOUR_INCREMENT_REQUIRED',
  ));
test('holiday category cannot be used on a normal workday', () =>
  rejects(
    () =>
      calculateOT('2026-09-22', [{ categoryId: 'holiday_ot', hours: 2 }], wage, otPolicy, calendar),
    'OT_DAY_CATEGORY',
  ));
test('holiday work and holiday overtime use distinct policy categories', () =>
  assert.equal(
    calculateOT(
      '2026-09-26',
      [
        { categoryId: 'holiday_work', hours: 2 },
        { categoryId: 'holiday_ot', hours: 4 },
      ],
      wage,
      otPolicy,
      calendar,
    ).totalSatang,
    '175000',
  ));
test('unknown statutory OT eligibility blocks calculation regardless of app role', () =>
  rejects(
    () =>
      calculateOT(
        '2026-09-22',
        [{ categoryId: 'weekday_ot', hours: 1 }],
        { ...wage, eligibility: 'unknown' },
        otPolicy,
        calendar,
      ),
    'OT_ELIGIBILITY_REQUIRED',
  ));
test('OT category legal floors cannot be reduced', () =>
  rejects(
    () =>
      validateLegalFloors('ot', {
        ...otPolicy,
        categories: [{ ...otPolicy.categories[0], multiplierBasisPoints: 10000 }],
      }),
    'LEGAL_OT_FLOOR',
  ));
test('commute is deducted per eligible home leg: 73km, 584 THB', () => {
  const result = calculateMileage(
    [
      {
        origin: 'home',
        destination: 'customer',
        originLabel: 'บ้าน',
        destinationLabel: 'ลูกค้า',
        distanceMetres: 55000,
        source: 'manual_attested',
      },
      {
        origin: 'customer',
        destination: 'home',
        originLabel: 'ลูกค้า',
        destinationLabel: 'บ้าน',
        distanceMetres: 58000,
        source: 'manual_attested',
      },
    ],
    20000,
    mileagePolicy,
  );
  assert.equal(result.eligibleMetres, 73000);
  assert.equal(result.totalSatang, '58400');
});
test('office leg has no commute deduction and short home leg clamps at zero', () => {
  const result = calculateMileage(
    [
      {
        origin: 'office',
        destination: 'customer',
        originLabel: 'สำนักงาน',
        destinationLabel: 'ลูกค้า',
        distanceMetres: 10000,
        source: 'manual_attested',
      },
      {
        origin: 'customer',
        destination: 'home',
        originLabel: 'ลูกค้า',
        destinationLabel: 'บ้าน',
        distanceMetres: 5000,
        source: 'manual_attested',
      },
    ],
    20000,
    mileagePolicy,
  );
  assert.equal(result.totalSatang, '8000');
  assert.equal(result.legs[1]!.eligibleMetres, 0);
});
test('historical mileage result does not change with a new policy object', () => {
  const result = calculateMileage(
    [
      {
        origin: 'office',
        destination: 'customer',
        originLabel: 'สำนักงาน',
        destinationLabel: 'ลูกค้า',
        distanceMetres: 10000,
        source: 'manual_attested',
      },
    ],
    20000,
    mileagePolicy,
  );
  const newer = { ...mileagePolicy, rateSatangPerKm: '900' };
  assert.equal(result.legs[0]!.rateSatangPerKm, '800');
  assert.equal(newer.rateSatangPerKm, '900');
});
test('per diem is an explicit inclusive day policy, not an invented rate', () => {
  assert.equal(
    calculatePerDiem('2026-09-18', '2026-09-20', 'international', true, perDiemPolicy).totalSatang,
    '480000',
  );
  rejects(
    () =>
      calculatePerDiem('2026-09-18', '2026-09-20', 'international', true, {
        ...perDiemPolicy,
        internationalRateSatang: null,
      }),
    'PER_DIEM_NOT_CONFIGURED',
  );
});
test('advance reconciliation supports refund and top-up', () => {
  assert.equal(calculateSettlement('1760000', '2000000').netSatang, '-240000');
  assert.equal(calculateSettlement('2200000', '2000000').movementSatang, '200000');
});
test('settlement has three calendar days, due today and overdue boundaries', () => {
  assert.equal(settlementDueDate('2026-09-20'), '2026-09-23');
  assert.equal(settlementState('2026-09-20', new Date('2026-09-23T16:59:59Z'), false), 'due_today');
  assert.equal(settlementState('2026-09-20', new Date('2026-09-23T17:00:00Z'), false), 'overdue');
  assert.equal(settlementState('2026-09-20', new Date('2026-10-01'), true), 'settled');
});
test('leave counts full working days and rejects half days', () => {
  const input = { typeId: 'annual', start: '2026-09-25', end: '2026-09-28', unit: 'full_day' };
  assert.equal(calculateLeave(input, leavePolicy, calendar, '2024-01-01', 3, 3).days, 2);
  rejects(
    () => calculateLeave({ ...input, unit: 'half_day' }, leavePolicy, calendar, '2024-01-01', 3, 3),
    'FULL_DAY_ONLY',
  );
});
test('sick paid cap does not remove the right to sick leave', () => {
  const result = calculateLeave(
    { typeId: 'sick', start: '2026-09-23', end: '2026-09-23', unit: 'full_day' },
    leavePolicy,
    calendar,
    '2024-01-01',
    30,
    30,
  );
  assert.equal(result.days, 1);
  assert.equal(result.paidDays, 0);
});
test('policy effective dates and immutable hash are respected', () => {
  const versions: VersionedPolicy[] = [
    {
      id: 'v1',
      family: 'mileage',
      version: 1,
      effectiveFrom: '2026-01-01',
      status: 'published',
      body: mileagePolicy,
      hash: fingerprint(mileagePolicy),
    },
    {
      id: 'v2',
      family: 'mileage',
      version: 2,
      effectiveFrom: '2026-10-01',
      status: 'published',
      body: { ...mileagePolicy, rateSatangPerKm: '900' },
      hash: fingerprint({ ...mileagePolicy, rateSatangPerKm: '900' }),
    },
  ];
  assert.equal(selectPolicy(versions, '2026-09-23').id, 'v1');
  assert.equal(selectPolicy(versions, '2026-10-01').id, 'v2');
});
