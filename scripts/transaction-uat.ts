import { randomUUID } from 'node:crypto';
import { addDays, bangkokDate, weekday } from '../src/domain/calendar';
import { DomainError, type Actor } from '../src/domain/core';
import { closeDb, db } from '../src/server/db';
import {
  financeDecision,
  headDecision,
  resubmitRequest,
  submitNewRequest,
} from '../src/server/request-service';

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
  financeOwner: {
    id: '10000000-0000-4000-8000-000000000005',
    displayName: 'การเงินทดสอบ ก',
    email: 'finance.a@example.invalid',
    roles: ['employee', 'head', 'finance', 'admin'],
    isHeadOwner: true,
    active: true,
  } satisfies Actor,
  financeOther: {
    id: '10000000-0000-4000-8000-000000000006',
    displayName: 'การเงินทดสอบ ข',
    email: 'finance.b@example.invalid',
    roles: ['employee', 'finance'],
    isHeadOwner: false,
    active: true,
  } satisfies Actor,
};

const projectId = '30000000-0000-4000-8000-000000000001';

function key(label: string) {
  return `uat-${label}-${randomUUID()}`;
}

function futureWorkingDate(seed: number): string {
  let date = addDays('2030-01-01', seed);
  while (![1, 2, 3, 4, 5].includes(weekday(date))) date = addDays(date, 1);
  return date;
}

function mileageExpense(title: string) {
  const date = bangkokDate(new Date());
  return {
    kind: 'expense' as const,
    title,
    projectId,
    description: 'UAT mileage transaction',
    parentTripId: null,
    lines: [
      {
        categoryId: 'mileage' as const,
        date,
        description: 'เดินทางพบลูกค้าสำหรับ UAT',
        documentIds: [],
        mileage: [
          {
            origin: 'home' as const,
            destination: 'customer' as const,
            originLabel: 'บ้าน',
            destinationLabel: 'ลูกค้า A',
            distanceMetres: 55_000,
            source: 'manual_attested' as const,
          },
          {
            origin: 'customer' as const,
            destination: 'home' as const,
            originLabel: 'ลูกค้า A',
            destinationLabel: 'บ้าน',
            distanceMetres: 58_000,
            source: 'manual_attested' as const,
          },
        ],
      },
    ],
  };
}

async function main() {
  const suffix = Number.parseInt(randomUUID().slice(0, 4), 16) % 1200;
  const leaveDate = futureWorkingDate(suffix);
  const leaveInput = {
    kind: 'leave' as const,
    title: 'UAT annual leave',
    projectId: null,
    description: 'ทดสอบ workflow การลา',
    typeId: 'annual',
    start: leaveDate,
    end: leaveDate,
    unit: 'full_day' as const,
    documentIds: [],
  };

  const leaveKey = key('leave-submit');
  const leave = await submitNewRequest(actors.employee, leaveInput, leaveKey);
  if (leave.workflowState !== 'pending_head' || leave.revision !== 1) {
    throw new Error('employee leave did not enter pending_head');
  }
  const leaveRetry = await submitNewRequest(actors.employee, leaveInput, leaveKey);
  if (leaveRetry.id !== leave.id) throw new Error('idempotent submit created a second request');

  const leaveApproved = await headDecision(
    actors.head,
    leave.id,
    { expectedRevision: leave.revision, action: 'approve' },
    key('leave-approve'),
  );
  if (leaveApproved.workflowState !== 'approved' || leaveApproved.revision !== 2) {
    throw new Error('head approval failed');
  }

  const ownerExpense = await submitNewRequest(
    actors.financeOwner,
    mileageExpense('UAT owner expense'),
    key('owner-expense-submit'),
  );
  if (ownerExpense.workflowState !== 'approved' || ownerExpense.financeState !== 'pending') {
    throw new Error('owner request did not system-skip to finance');
  }
  const [skip] = await db()`
    select actor_id, action
    from approval_actions
    where request_id=${ownerExpense.id}
    order by occurred_at
    limit 1
  `;
  if (!skip || skip.action !== 'system_skipped' || skip.actor_id !== null) {
    throw new Error('owner request was not recorded as system_skipped');
  }

  let conflictCode = '';
  try {
    await financeDecision(
      actors.financeOwner,
      ownerExpense.id,
      { expectedRevision: ownerExpense.revision, action: 'finance_verify' },
      key('owner-self-finance'),
    );
  } catch (error) {
    if (error instanceof DomainError) conflictCode = error.code;
    else throw error;
  }
  if (conflictCode !== 'FINANCE_CONFLICT_OF_INTEREST') {
    throw new Error('finance self-verification was not blocked');
  }

  const ownerVerified = await financeDecision(
    actors.financeOther,
    ownerExpense.id,
    { expectedRevision: ownerExpense.revision, action: 'finance_verify' },
    key('owner-finance-verify'),
  );
  if (ownerVerified.financeState !== 'verified' || ownerVerified.paymentState !== 'unpaid') {
    throw new Error('independent finance verification failed');
  }

  const employeeExpenseInput = mileageExpense('UAT employee expense correction');
  const employeeExpense = await submitNewRequest(
    actors.employee,
    employeeExpenseInput,
    key('employee-expense-submit'),
  );
  const returned = await headDecision(
    actors.head,
    employeeExpense.id,
    {
      expectedRevision: employeeExpense.revision,
      action: 'return',
      reason: 'UAT correction round',
    },
    key('employee-expense-return'),
  );
  if (returned.workflowState !== 'returned') throw new Error('head return failed');

  const resubmitted = await resubmitRequest(
    actors.employee,
    returned.id,
    returned.revision,
    employeeExpenseInput,
    key('employee-expense-resubmit'),
  );
  if (resubmitted.workflowState !== 'pending_head' || resubmitted.round !== 2) {
    throw new Error('resubmit did not create review round 2');
  }

  const expenseApproved = await headDecision(
    actors.head,
    resubmitted.id,
    { expectedRevision: resubmitted.revision, action: 'approve' },
    key('employee-expense-approve'),
  );
  if (expenseApproved.financeState !== 'pending') {
    throw new Error('approved expense did not enter finance queue');
  }

  const expenseVerified = await financeDecision(
    actors.financeOther,
    expenseApproved.id,
    { expectedRevision: expenseApproved.revision, action: 'finance_verify' },
    key('employee-expense-finance'),
  );
  if (expenseVerified.financeState !== 'verified' || expenseVerified.totalSatang !== '58400') {
    throw new Error('expense verification/calculation mismatch');
  }

  const [payable] = await db()`
    select amount_satang::text, verified_by
    from payable_obligations
    where request_id=${expenseVerified.id}
  `;
  if (
    !payable ||
    payable.amount_satang !== '58400' ||
    payable.verified_by !== actors.financeOther.id
  ) {
    throw new Error('payable obligation mismatch');
  }

  const [roundCount] = await db()`
    select count(*)::integer as count
    from request_revisions
    where request_id=${expenseVerified.id}
  `;
  if (roundCount?.count !== 2) throw new Error('request revision history was not preserved');

  console.log(
    JSON.stringify({
      event: 'transaction_uat_pass',
      idempotentSubmit: true,
      employeeHeadApproval: true,
      ownerSystemSkip: true,
      financeConflictBlocked: true,
      independentFinanceVerify: true,
      returnResubmitRound: resubmitted.round,
      payableSatang: payable.amount_satang,
      leaveRequest: leave.id,
      ownerExpense: ownerExpense.id,
      correctedExpense: expenseVerified.id,
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
