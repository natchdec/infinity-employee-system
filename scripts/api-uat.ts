import { randomUUID } from 'node:crypto';
import { closeDb } from '../src/server/db';
import { cookieNames, issueSession } from '../src/server/identity';

const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:4311';
const employeeId = '10000000-0000-4000-8000-000000000001';
const headId = '10000000-0000-4000-8000-000000000002';
const financeOwnerId = '10000000-0000-4000-8000-000000000005';
const financeOtherId = '10000000-0000-4000-8000-000000000006';
const projectId = '30000000-0000-4000-8000-000000000001';

function key(label: string): string {
  return `api-uat-${label}-${randomUUID()}`;
}

function mileageExpense(title: string) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return {
    kind: 'expense',
    title,
    projectId,
    description: 'API UAT mileage transaction',
    parentTripId: null,
    lines: [
      {
        categoryId: 'mileage',
        date,
        description: 'เดินทางพบลูกค้าสำหรับ API UAT',
        documentIds: [],
        mileage: [
          {
            origin: 'home',
            destination: 'customer',
            originLabel: 'บ้าน',
            destinationLabel: 'ลูกค้า A',
            distanceMetres: 55_000,
            source: 'manual_attested',
          },
          {
            origin: 'customer',
            destination: 'home',
            originLabel: 'ลูกค้า A',
            destinationLabel: 'บ้าน',
            distanceMetres: 58_000,
            source: 'manual_attested',
          },
        ],
      },
    ],
  };
}

async function session(employeeId: string) {
  const issued = await issueSession(employeeId);
  const names = cookieNames();
  return {
    csrf: issued.antiForgeryValue,
    cookie: `${names.session}=${encodeURIComponent(issued.sessionValue)}; ${names.csrf}=${encodeURIComponent(
      issued.antiForgeryValue,
    )}`,
  };
}

async function post(
  path: string,
  auth: { csrf: string; cookie: string },
  body: unknown,
  idempotencyKey: string,
  includeCsrf = true,
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: auth.cookie,
    'idempotency-key': idempotencyKey,
    'x-correlation-id': randomUUID(),
  };
  if (includeCsrf) headers['x-csrf-token'] = auth.csrf;

  const response = await fetch(new URL(path, origin), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as {
    ok: boolean;
    request?: {
      id: string;
      revision: number;
      round: number;
      workflowState: string;
      financeState: string;
      paymentState: string;
      totalSatang: string;
    };
    error?: { code: string; message: string };
  };
  return { status: response.status, value };
}

async function main() {
  const health = await fetch(new URL('/api/health', origin));
  const ready = await fetch(new URL('/api/ready', origin));
  if (health.status !== 200 || ready.status !== 200) {
    throw new Error(`runtime not ready health=${health.status} ready=${ready.status}`);
  }

  const employee = await session(employeeId);
  const head = await session(headId);
  const financeOwner = await session(financeOwnerId);
  const financeOther = await session(financeOtherId);

  const missingCsrf = await post(
    '/api/requests',
    employee,
    mileageExpense('API UAT missing CSRF'),
    key('missing-csrf'),
    false,
  );
  if (missingCsrf.status !== 403 || missingCsrf.value.error?.code !== 'ANTI_FORGERY_REQUIRED') {
    throw new Error(`missing CSRF was not blocked: ${JSON.stringify(missingCsrf)}`);
  }

  const submitKey = key('employee-submit');
  const employeeInput = mileageExpense('API UAT employee expense');
  const submitted = await post('/api/requests', employee, employeeInput, submitKey);
  if (
    submitted.status !== 201 ||
    !submitted.value.request ||
    submitted.value.request.workflowState !== 'pending_head' ||
    submitted.value.request.totalSatang !== '58400'
  ) {
    throw new Error(`employee submit failed: ${JSON.stringify(submitted)}`);
  }

  const retry = await post('/api/requests', employee, employeeInput, submitKey);
  if (
    retry.status !== 201 ||
    retry.value.request?.id !== submitted.value.request.id ||
    retry.value.request?.revision !== submitted.value.request.revision
  ) {
    throw new Error('idempotent HTTP submit did not return original result');
  }

  const approved = await post(
    `/api/requests/${submitted.value.request.id}/commands`,
    head,
    { expectedRevision: submitted.value.request.revision, action: 'approve' },
    key('head-approve'),
  );
  if (
    approved.status !== 200 ||
    approved.value.request?.workflowState !== 'approved' ||
    approved.value.request.financeState !== 'pending'
  ) {
    throw new Error(`head API approval failed: ${JSON.stringify(approved)}`);
  }

  const verified = await post(
    `/api/requests/${submitted.value.request.id}/commands`,
    financeOther,
    { expectedRevision: approved.value.request.revision, action: 'finance_verify' },
    key('finance-verify'),
  );
  if (
    verified.status !== 200 ||
    verified.value.request?.financeState !== 'verified' ||
    verified.value.request.paymentState !== 'unpaid'
  ) {
    throw new Error(`finance API verify failed: ${JSON.stringify(verified)}`);
  }

  const ownerSubmitted = await post(
    '/api/requests',
    financeOwner,
    mileageExpense('API UAT finance owner expense'),
    key('owner-submit'),
  );
  if (
    ownerSubmitted.status !== 201 ||
    ownerSubmitted.value.request?.workflowState !== 'approved' ||
    ownerSubmitted.value.request.financeState !== 'pending'
  ) {
    throw new Error(`owner system skip failed: ${JSON.stringify(ownerSubmitted)}`);
  }

  const selfVerify = await post(
    `/api/requests/${ownerSubmitted.value.request.id}/commands`,
    financeOwner,
    {
      expectedRevision: ownerSubmitted.value.request.revision,
      action: 'finance_verify',
    },
    key('owner-self-verify'),
  );
  if (
    selfVerify.status !== 403 ||
    selfVerify.value.error?.code !== 'FINANCE_CONFLICT_OF_INTEREST'
  ) {
    throw new Error(`finance self-verify was not blocked: ${JSON.stringify(selfVerify)}`);
  }

  console.log(
    JSON.stringify({
      event: 'api_uat_pass',
      health: health.status,
      ready: ready.status,
      csrfBlocked: true,
      idempotentSubmit: true,
      employeeHeadApproval: true,
      financeVerify: true,
      ownerSystemSkip: true,
      financeConflictBlocked: true,
      payableSatang: verified.value.request.totalSatang,
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
