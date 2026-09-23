import { randomUUID } from 'node:crypto';
import { db, closeDb } from '../src/server/db';
import { cookieNames, issueSession } from '../src/server/identity';

const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:4311';
const ids = {
  employee: '10000000-0000-4000-8000-000000000001',
  head: '10000000-0000-4000-8000-000000000002',
  finance: '10000000-0000-4000-8000-000000000005',
  admin: '10000000-0000-4000-8000-000000000005',
};

async function page(path: string, employeeId: string, expectedText: string) {
  const session = await issueSession(employeeId);
  const response = await fetch(new URL(path, origin), {
    redirect: 'manual',
    headers: {
      cookie: `${cookieNames().session}=${encodeURIComponent(session.sessionValue)}`,
    },
  });
  const body = await response.text();
  if (response.status !== 200 || !body.includes(expectedText)) {
    throw new Error(`route failed ${path}: ${response.status}`);
  }
  return { path, status: response.status, expectedText };
}

async function main() {
  const health = await fetch(new URL('/api/health', origin));
  const ready = await fetch(new URL('/api/ready', origin));
  if (health.status !== 200) throw new Error(`health ${health.status}`);
  if (ready.status !== 200) throw new Error(`ready ${ready.status}`);

  const unauth = await fetch(new URL('/', origin), { redirect: 'manual' });
  if (![302, 303, 307, 308].includes(unauth.status)) {
    throw new Error(`unauthenticated home did not redirect: ${unauth.status}`);
  }

  const pages = [];
  pages.push(await page('/', ids.employee, 'สร้างคำขอ'));
  pages.push(await page('/requests', ids.employee, 'รายการของฉัน'));
  pages.push(await page('/trips', ids.employee, 'การเดินทาง'));
  pages.push(await page('/approvals', ids.head, 'รออนุมัติ'));
  pages.push(await page('/finance', ids.finance, 'งานการเงิน'));
  pages.push(await page('/admin', ids.admin, 'จัดการระบบ'));

  const [heartbeat] = await db()`
    select worker_id, last_seen_at
    from runtime_heartbeats
    where last_seen_at > now() - interval '15 seconds'
    order by last_seen_at desc
    limit 1
  `;
  if (!heartbeat) throw new Error('worker heartbeat missing');

  const dedupe = `uat:${randomUUID()}`;
  await db()`
    insert into jobs(kind,dedupe_key,payload)
    values(
      'in_app_notification',
      ${dedupe},
      ${db().json({
        employeeId: ids.employee,
        title: 'UAT durable worker',
        href: '/',
      })}
    )
  `;

  let jobState = '';
  let notificationCount = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const [job] = await db()`select state from jobs where dedupe_key=${dedupe}`;
    const [notice] = await db()`
      select count(*)::integer as count
      from notifications
      where event_key=${dedupe}
    `;
    jobState = job?.state ?? '';
    notificationCount = notice?.count ?? 0;
    if (jobState === 'succeeded' && notificationCount === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (jobState !== 'succeeded' || notificationCount !== 1) {
    throw new Error(`durable job failed: state=${jobState} notifications=${notificationCount}`);
  }

  console.log(
    JSON.stringify({
      event: 'runtime_uat_pass',
      health: health.status,
      ready: ready.status,
      unauthRedirect: unauth.status,
      pages,
      workerHeartbeat: true,
      durableJob: {
        state: jobState,
        notificationCount,
      },
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
