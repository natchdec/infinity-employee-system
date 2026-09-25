import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/domain/core';
import { requestSchemas } from '../src/domain/requests';
import { aggregateEasyAccOt, formatEasyAccPrimport } from '../src/server/integrations/easy-acc';

test('Easy-ACC PRIMPORT uses six single-space-delimited fields and three decimals', () => {
  assert.equal(
    formatEasyAccPrimport([
      {
        employeeCode: '000123',
        workDays: '22',
        ot1Hours: '3',
        ot2Hours: '0',
        ot3Hours: '4.5',
        ot4Hours: '0',
      },
    ]),
    '000123 22.000 3.000 0.000 4.500 0.000\r\n',
  );
});

test('Easy-ACC export rejects unverified employee code shape', () => {
  assert.throws(
    () =>
      formatEasyAccPrimport([
        {
          employeeCode: 'EMP-1',
          workDays: '22',
          ot1Hours: '0',
          ot2Hours: '0',
          ot3Hours: '0',
          ot4Hours: '0',
        },
      ]),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'EASY_ACC_EMPLOYEE_CODE_INVALID',
  );
});

test('Easy-ACC OT mapping is explicit and never guesses a slot', () => {
  assert.deepEqual(
    aggregateEasyAccOt(
      [
        { categoryId: 'weekday_ot', hours: 3 },
        { categoryId: 'holiday_work', hours: 2 },
      ],
      { weekday_ot: 1, holiday_work: 3 },
    ),
    [3, 0, 2, 0],
  );
  assert.throws(
    () => aggregateEasyAccOt([{ categoryId: 'unknown', hours: 1 }], {}),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'EASY_ACC_OT_MAPPING_MISSING',
  );
});

test('Google mileage input requires a server-issued quote reference', () => {
  const base = {
    title: 'Mileage',
    projectId: null,
    description: 'Customer visit',
    kind: 'expense' as const,
    parentTripId: null,
    lines: [
      {
        categoryId: 'mileage' as const,
        date: '2026-09-25',
        description: 'Office to customer',
        documentIds: [],
        mileage: [
          {
            origin: 'office' as const,
            destination: 'customer' as const,
            originLabel: 'Office',
            destinationLabel: 'Customer',
            distanceMetres: 10000,
            source: 'google_routes' as const,
          },
        ],
      },
    ],
  };
  assert.equal(requestSchemas.expense.safeParse(base).success, false);
  assert.equal(
    requestSchemas.expense.safeParse({
      ...base,
      lines: [
        {
          ...base.lines[0],
          mileage: [
            {
              ...base.lines[0]!.mileage[0]!,
              providerReference: '00000000-0000-4000-8000-000000000001',
            },
          ],
        },
      ],
    }).success,
    true,
  );
});

test('manual mileage attestation cannot smuggle a provider reference', () => {
  const leg = {
    origin: 'office' as const,
    destination: 'customer' as const,
    originLabel: 'Office',
    destinationLabel: 'Customer',
    distanceMetres: 10000,
    source: 'manual_attested' as const,
    providerReference: '00000000-0000-4000-8000-000000000001',
  };
  const result = requestSchemas.expense.safeParse({
    title: 'Mileage',
    projectId: null,
    description: 'Customer visit',
    kind: 'expense',
    parentTripId: null,
    lines: [
      {
        categoryId: 'mileage',
        date: '2026-09-25',
        description: 'Visit',
        documentIds: [],
        mileage: [leg],
      },
    ],
  });
  assert.equal(result.success, false);
});
