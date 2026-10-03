import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRequestInput } from '../src/components/request/form-utils';
import type { RequestFormOptions } from '../src/server/request-view';

const options: RequestFormOptions = {
  projects: [],
  leaveTypes: [],
  otCategories: [],
  expenseCategories: [
    {
      id: 'mileage',
      label: 'Mileage',
      evidenceRequired: false,
      originalRequired: false,
    },
  ],
  perDiem: {
    domesticRateSatang: null,
    internationalRateSatang: null,
    settlementDueDays: 3,
  },
  homeAddress: null,
  commuteDistanceMetres: null,
  approvedTrips: [],
  receiptInbox: [],
};

test('expense form preserves a three-leg onsite route chain', () => {
  const data = new FormData();
  data.set('title', 'Onsite A to B');
  data.set('projectId', '');
  data.set('description', 'Calendar multi-stop route');
  data.set('categoryId', 'mileage');
  data.set('date', '2026-09-28');
  data.set('lineDescription', 'Office to A to B to Office');
  data.set('parentTripId', '');
  data.set('mileageLegCount', '3');

  const legs = [
    ['office', 'customer', 'สำนักงาน', 'Customer A', '12.5'],
    ['customer', 'customer', 'Customer A', 'Customer B', '8.25'],
    ['customer', 'office', 'Customer B', 'สำนักงาน', '14'],
  ] as const;
  legs.forEach((leg, offset) => {
    const index = offset + 1;
    data.set(`leg${index}Origin`, leg[0]);
    data.set(`leg${index}Destination`, leg[1]);
    data.set(`leg${index}OriginLabel`, leg[2]);
    data.set(`leg${index}DestinationLabel`, leg[3]);
    data.set(`leg${index}Km`, leg[4]);
  });

  const result = buildRequestInput('expense', data, options, []);
  const line = (result.lines as Record<string, unknown>[])[0]!;
  assert.deepEqual(line.mileage, [
    {
      origin: 'office',
      destination: 'customer',
      originLabel: 'สำนักงาน',
      destinationLabel: 'Customer A',
      distanceMetres: 12500,
      source: 'manual_attested',
    },
    {
      origin: 'customer',
      destination: 'customer',
      originLabel: 'Customer A',
      destinationLabel: 'Customer B',
      distanceMetres: 8250,
      source: 'manual_attested',
    },
    {
      origin: 'customer',
      destination: 'office',
      originLabel: 'Customer B',
      destinationLabel: 'สำนักงาน',
      distanceMetres: 14000,
      source: 'manual_attested',
    },
  ]);
});

test('expense form keeps receipts mapped to their own lines', () => {
  const data = new FormData();
  data.set('title', 'Onsite expenses');
  data.set('projectId', '');
  data.set('description', 'Toll and parking');
  data.set('parentTripId', '');
  data.set('expenseLineCount', '2');

  data.set('expenseLine1CategoryId', 'toll');
  data.set('expenseLine1Date', '2026-09-29');
  data.set('expenseLine1Description', 'Expressway toll');
  data.set('expenseLine1Amount', '90');
  data.append('expenseLine1DocumentId', '11111111-1111-4111-8111-111111111111');

  data.set('expenseLine2CategoryId', 'parking');
  data.set('expenseLine2Date', '2026-09-29');
  data.set('expenseLine2Description', 'Customer parking');
  data.set('expenseLine2Amount', '60');
  data.append('expenseLine2DocumentId', '22222222-2222-4222-8222-222222222222');

  const result = buildRequestInput('expense', data, options, []);
  assert.deepEqual(result.lines, [
    {
      categoryId: 'toll',
      date: '2026-09-29',
      description: 'Expressway toll',
      documentIds: ['11111111-1111-4111-8111-111111111111'],
      amount: '90',
    },
    {
      categoryId: 'parking',
      date: '2026-09-29',
      description: 'Customer parking',
      documentIds: ['22222222-2222-4222-8222-222222222222'],
      amount: '60',
    },
  ]);
});
