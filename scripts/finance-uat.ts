import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DomainError, type Actor } from '../src/domain/core';
import { closeDb, db } from '../src/server/db';
import { documentForActor, uploadDocument } from '../src/server/documents';
import { createAccountingExport, createPayrollExport } from '../src/server/exports';
import { markOriginalReceiptReceived } from '../src/server/finance-ops';
import {
  createPaymentBatch,
  markPaymentBatchPaid,
  type PaymentBatchResult,
} from '../src/server/payment';
import { financeDecision, headDecision, submitNewRequest } from '../src/server/request-service';
import {
  confirmSettlementRefund,
  submitSettlement,
  verifySettlement,
} from '../src/server/settlement';

const actors = {
  employee: {
    id: '10000000-0000-4000-8000-000000000001',
    displayName: 'พนักงานทดสอบ ก',
    email: 'employee.a@example.invalid',
    roles: ['employee'],
    isHeadOwner: false,
    active: true,
  } satisfies Actor,
  head: {
    id: '10000000-0000-4000-8000-000000000002',
    displayName: 'หัวหน้าทดสอบ ก',
    email: 'head.a@example.invalid',
    roles: ['employee', 'head'],
    isHeadOwner: true,
    active: true,
  } satisfies Actor,
  employeeOther: {
    id: '10000000-0000-4000-8000-000000000003',
    displayName: 'พนักงานทดสอบ ข',
    email: 'employee.b@example.invalid',
    roles: ['employee'],
    isHeadOwner: false,
    active: true,
  } satisfies Actor,
  finance: {
    id: '10000000-0000-4000-8000-000000000006',
    displayName: 'การเงินทดสอบ ข',
    email: 'finance.b@example.invalid',
    roles: ['employee', 'finance'],
    isHeadOwner: false,
    active: true,
  } satisfies Actor,
};

const projectId = '30000000-0000-4000-8000-000000000001';
const now = new Date('2026-09-23T10:00:00+07:00');

function key(label: string): string {
  return `uat-fin-${label}-${randomUUID()}`;
}

async function expectDomain(expected: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof DomainError && error.code === expected) return;
    throw error;
  }
  throw new Error(`expected DomainError ${expected}`);
}

async function receipt(label: string) {
  const tint = Number.parseInt(randomUUID().slice(0, 2), 16);
  const bytes = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: tint, g: 180, b: 220 },
    },
  })
    .png()
    .toBuffer();
  const idempotencyKey = key(`receipt-${label}`);
  const first = await uploadDocument(
    actors.employee,
    { filename: `${label}.png`, bytes },
    'expense',
    idempotencyKey,
  );
  const replay = await uploadDocument(
    actors.employee,
    { filename: `${label}.png`, bytes },
    'expense',
    idempotencyKey,
  );
  if (first.id !== replay.id) throw new Error('document idempotent replay changed id');

  const different = await sharp({
    create: {
      width: 33,
      height: 24,
      channels: 3,
      background: { r: tint, g: 181, b: 220 },
    },
  })
    .png()
    .toBuffer();
  await expectDomain('IDEMPOTENCY_CONFLICT', () =>
    uploadDocument(
      actors.employee,
      { filename: `${label}-different.png`, bytes: different },
      'expense',
      idempotencyKey,
    ),
  );

  await expectDomain('DOCUMENT_NOT_FOUND', () => documentForActor(actors.employeeOther, first.id));
  return first;
}

async function approveRequest(input: unknown, label: string) {
  const submitted = await submitNewRequest(actors.employee, input, key(`${label}-submit`), now);
  if (submitted.workflowState !== 'pending_head') {
    throw new Error(`${label} did not route to Head`);
  }
  const approved = await headDecision(
    actors.head,
    submitted.id,
    { expectedRevision: submitted.revision, action: 'approve' },
    key(`${label}-approve`),
    now,
  );
  if (approved.workflowState !== 'approved') throw new Error(`${label} not approved`);
  return approved;
}

async function financeVerify(requestId: string, revision: number, label: string) {
  const result = await financeDecision(
    actors.finance,
    requestId,
    { expectedRevision: revision, action: 'finance_verify' },
    key(`${label}-verify`),
    now,
  );
  if (result.financeState !== 'verified') throw new Error(`${label} finance verification failed`);
  return result;
}

async function payObligation(obligationId: string, label: string): Promise<PaymentBatchResult> {
  const batch = await createPaymentBatch(
    actors.finance,
    { method: 'transfer', obligationIds: [obligationId] },
    key(`${label}-batch`),
    now,
  );
  const payKey = key(`${label}-pay`);
  const input = {
    expectedRevision: batch.revision,
    paidDate: '2026-09-23',
    externalReference: `UAT-${label}-${randomUUID().slice(0, 8)}`,
  };
  const paid = await markPaymentBatchPaid(actors.finance, batch.id, input, payKey, now);
  const replay = await markPaymentBatchPaid(actors.finance, batch.id, input, payKey, now);
  if (replay.id !== paid.id || replay.revision !== paid.revision) {
    throw new Error('payment idempotent replay mismatch');
  }
  await expectDomain('IDEMPOTENCY_CONFLICT', () =>
    markPaymentBatchPaid(
      actors.finance,
      batch.id,
      { ...input, externalReference: input.externalReference + '-changed' },
      payKey,
      now,
    ),
  );
  return paid;
}

async function standaloneExpense() {
  const doc = await receipt('standalone');
  const approved = await approveRequest(
    {
      kind: 'expense',
      title: 'UAT standalone expense',
      projectId,
      description: 'UAT payment and original receipt',
      parentTripId: null,
      lines: [
        {
          categoryId: 'other',
          date: '2026-09-22',
          description: 'UAT standalone item',
          amount: '1234.56',
          documentIds: [doc.id],
        },
      ],
    },
    'standalone-expense',
  );

  const verified = await financeVerify(approved.id, approved.revision, 'standalone-expense');
  if (verified.paymentState !== 'unpaid') throw new Error('standalone expense not payable');

  const [obligation] = await db()`
    select id,amount_satang::text
    from payable_obligations
    where request_id=${verified.id} and state='unpaid'
  `;
  if (!obligation || obligation.amount_satang !== '123456') {
    throw new Error('standalone payable missing or wrong');
  }
  await payObligation(obligation.id, 'standalone-expense');

  const [paidRequest] = await db()`
    select payment_state from requests where id=${verified.id}
  `;
  if (paidRequest?.payment_state !== 'paid') throw new Error('standalone expense not marked paid');

  const [original] = await db()`
    select state,revision from original_receipts where request_id=${verified.id}
  `;
  if (!original || original.state !== 'outstanding') {
    throw new Error('paid expense did not keep original receipt outstanding');
  }
  const received = await markOriginalReceiptReceived(
    actors.finance,
    verified.id,
    { expectedRevision: original.revision, note: 'UAT paper receipt' },
    key('original-received'),
    now,
  );
  if (received.state !== 'received') throw new Error('original receipt receive failed');

  await documentForActor(actors.finance, doc.id);
  await expectDomain('DOCUMENT_NOT_FOUND', () => documentForActor(actors.employeeOther, doc.id));
  return verified.id;
}

async function tripScenario(label: string, actualAmount: string) {
  const trip = await approveRequest(
    {
      kind: 'trip',
      title: `UAT trip ${label}`,
      projectId,
      description: `Settlement scenario ${label}`,
      start: label === 'refund' ? '2026-09-20' : '2026-09-18',
      end: label === 'refund' ? '2026-09-21' : '2026-09-19',
      destination: 'ลูกค้า UAT',
      region: 'domestic',
      requestPerDiem: false,
      estimatedAmount: '0',
      currency: 'THB',
    },
    `trip-${label}`,
  );

  const advance = await approveRequest(
    {
      kind: 'advance',
      title: `UAT advance ${label}`,
      projectId: null,
      description: 'Advance 20,000 THB',
      parentTripId: trip.id,
      date: label === 'refund' ? '2026-09-19' : '2026-09-17',
      amount: '20000',
    },
    `advance-${label}`,
  );
  const verifiedAdvance = await financeVerify(advance.id, advance.revision, `advance-${label}`);
  const [advanceObligation] = await db()`
    select id from payable_obligations
    where request_id=${verifiedAdvance.id} and state='unpaid'
  `;
  if (!advanceObligation) throw new Error('advance payable missing');
  await payObligation(advanceObligation.id, `advance-${label}`);

  const doc = await receipt(`trip-${label}`);
  const expense = await approveRequest(
    {
      kind: 'expense',
      title: `UAT trip expense ${label}`,
      projectId,
      description: `Trip actual ${actualAmount} THB`,
      parentTripId: trip.id,
      lines: [
        {
          categoryId: 'other',
          date: label === 'refund' ? '2026-09-21' : '2026-09-19',
          description: 'Trip actual cost',
          amount: actualAmount,
          documentIds: [doc.id],
        },
      ],
    },
    `trip-expense-${label}`,
  );
  const verifiedExpense = await financeVerify(
    expense.id,
    expense.revision,
    `trip-expense-${label}`,
  );
  if (verifiedExpense.paymentState !== 'not_applicable') {
    throw new Error('trip expense incorrectly routed to direct payment');
  }
  const [directPayable] = await db()`
    select count(*)::integer as count
    from payable_obligations
    where request_id=${verifiedExpense.id}
  `;
  if (directPayable?.count !== 0) throw new Error('trip expense created duplicate payable');

  const submitted = await submitSettlement(
    actors.employee,
    trip.id,
    key(`settlement-${label}-submit`),
    now,
  );
  const verifiedSettlement = await verifySettlement(
    actors.finance,
    submitted.id,
    { expectedRevision: submitted.revision },
    key(`settlement-${label}-verify`),
    now,
  );

  const expected =
    label === 'refund'
      ? { state: 'refund_due', net: '-240000' }
      : { state: 'top_up_due', net: '200000' };
  if (
    verifiedSettlement.state !== expected.state ||
    verifiedSettlement.netSatang !== expected.net
  ) {
    throw new Error(
      `settlement ${label} mismatch: ${verifiedSettlement.state}/${verifiedSettlement.netSatang}`,
    );
  }

  if (label === 'refund') {
    const settled = await confirmSettlementRefund(
      actors.finance,
      verifiedSettlement.id,
      {
        expectedRevision: verifiedSettlement.revision,
        externalReference: `UAT-REFUND-${randomUUID().slice(0, 8)}`,
      },
      key('settlement-refund-received'),
      now,
    );
    if (settled.state !== 'settled') throw new Error('refund settlement did not close');
  } else {
    const [topUp] = await db()`
      select id,amount_satang::text
      from payable_obligations
      where source_kind='settlement' and source_id=${verifiedSettlement.id} and state='unpaid'
    `;
    if (!topUp || topUp.amount_satang !== '200000') throw new Error('top-up payable mismatch');
    await payObligation(topUp.id, 'settlement-topup');
    const [closed] = await db()`select state from settlements where id=${verifiedSettlement.id}`;
    if (closed?.state !== 'settled') throw new Error('top-up settlement not closed after payment');
  }

  return {
    tripId: trip.id,
    expenseId: verifiedExpense.id,
    settlementId: verifiedSettlement.id,
    netSatang: verifiedSettlement.netSatang,
  };
}

async function payrollAndExports() {
  const ot = await approveRequest(
    {
      kind: 'ot',
      title: 'UAT OT payroll',
      projectId,
      description: 'UAT payroll cycle and export',
      date: '2026-09-22',
      task: 'UAT verified task',
      lines: [{ categoryId: 'weekday_ot', hours: 2 }],
    },
    'ot-payroll',
  );
  const [item] = await db()`
    select cycle_month,amount_satang::text,state
    from payroll_items
    where request_id=${ot.id} and round=${ot.round}
  `;
  if (!item || item.state !== 'queued') throw new Error('OT payroll item missing');

  const review = await createPayrollExport(
    actors.finance,
    { month: item.cycle_month, adapter: 'neutral_review_csv' },
    key('payroll-review'),
    now,
  );
  if (review.state !== 'completed' || !review.artifactSha256 || !review.artifactContent) {
    throw new Error('payroll review export failed');
  }
  const easy = await createPayrollExport(
    actors.finance,
    { month: item.cycle_month, adapter: 'easy_acc' },
    key('payroll-easyacc'),
    now,
  );
  if (easy.state !== 'blocked' || !easy.blockedReason?.includes('Easy-ACC')) {
    throw new Error('Easy-ACC adapter did not fail closed');
  }

  const accounting = await createAccountingExport(
    actors.finance,
    { from: '2026-09-23', to: '2026-09-23', adapter: 'neutral_review_csv' },
    key('accounting-review'),
    now,
  );
  if (
    accounting.state !== 'completed' ||
    !accounting.artifactSha256 ||
    !accounting.artifactContent
  ) {
    throw new Error('accounting review export failed');
  }
  const smartbiz = await createAccountingExport(
    actors.finance,
    { from: '2026-09-23', to: '2026-09-23', adapter: 'smartbiz' },
    key('accounting-smartbiz'),
    now,
  );
  if (smartbiz.state !== 'blocked' || !smartbiz.blockedReason?.includes('Smartbiz')) {
    throw new Error('Smartbiz adapter did not fail closed');
  }

  return {
    payrollMonth: item.cycle_month,
    payrollAmountSatang: item.amount_satang,
    payrollReviewSha256: review.artifactSha256,
    accountingReviewSha256: accounting.artifactSha256,
  };
}

async function main() {
  await expectDomain('PDF_SCAN_UNAVAILABLE', () =>
    uploadDocument(
      actors.employee,
      {
        filename: 'blocked.pdf',
        bytes: new TextEncoder().encode('%PDF-1.7 UAT'),
      },
      'expense',
      key('pdf-block'),
    ),
  );

  const standaloneRequest = await standaloneExpense();
  const refund = await tripScenario('refund', '17600');
  const topUp = await tripScenario('topup', '22000');
  const exports = await payrollAndExports();

  console.log(
    JSON.stringify({
      event: 'finance_travel_uat_pass',
      documentUploadIdempotency: true,
      pdfFailClosed: true,
      documentAuthorization: true,
      standalonePayment: true,
      originalReceiptIndependent: true,
      tripExpenseNoDirectPayable: true,
      refundScenario: {
        expectedAdvanceSatang: '2000000',
        expectedActualSatang: '1760000',
        netSatang: refund.netSatang,
      },
      topUpScenario: {
        expectedAdvanceSatang: '2000000',
        expectedActualSatang: '2200000',
        netSatang: topUp.netSatang,
      },
      paymentIdempotency: true,
      payrollExport: true,
      easyAccFailClosed: true,
      accountingExport: true,
      smartbizFailClosed: true,
      standaloneRequest,
      refund,
      topUp,
      exports,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
