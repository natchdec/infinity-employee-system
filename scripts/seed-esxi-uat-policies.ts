import type postgres from 'postgres';
import { connectDatabase } from '../src/server/connection';
import { fingerprint } from '../src/domain/core';
import { validateLegalFloors, type PolicyFamily } from '../src/domain/policy';
import {
  calendar,
  otPolicy,
  leavePolicy,
  mileagePolicy,
  perDiemPolicy,
  expensePolicy,
} from '../tests/fixtures';

if (process.env.APP_ENV !== 'uat' || process.env.ESXI_UAT_POLICY_SEED_ALLOWED !== 'true')
  throw new Error('ESXi UAT policy seed requires APP_ENV=uat and explicit opt-in');

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is required');
const target = new URL(url);
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['db', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/infinity_employee' ||
  process.env.APP_ORIGIN !== 'https://172.20.11.220'
)
  throw new Error('Refusing to seed a database outside the dedicated ESXi UAT target');

const effectiveFrom = '2026-01-01';
const policies: Record<PolicyFamily, unknown> = {
  calendar,
  leave: leavePolicy,
  ot: otPolicy,
  mileage: mileagePolicy,
  per_diem: perDiemPolicy,
  expense: expensePolicy,
  payroll: {
    cutoffDay: 24,
    payday: 25,
    cutoffBasis: 'end_last_workday_before_cutoff',
    timeZone: 'Asia/Bangkok',
  },
  approval: {
    manager: 'line_head',
    ownerHeadSkip: true,
    financeIndependent: true,
    projectManagerApproval: false,
  },
};

const sql = connectDatabase(url, {
  max: 1,
  applicationName: 'infinity-employee-esxi-uat-policy-seed',
});

try {
  const result = await sql.begin(async (tx) => {
    const inserted: string[] = [];
    const unchanged: string[] = [];

    for (const [family, body] of Object.entries(policies) as [PolicyFamily, unknown][]) {
      validateLegalFloors(family, body);
      const hash = fingerprint(body);
      const rows = await tx.unsafe(
        'select version,effective_from::text,status,body_hash from policy_versions where family=$1 order by version desc limit 1',
        [family],
      );
      const existing = rows[0];

      if (existing) {
        if (
          existing.version !== 1 ||
          existing.effective_from !== effectiveFrom ||
          existing.status !== 'published' ||
          existing.body_hash !== hash
        )
          throw new Error(
            'Existing ' +
              family +
              ' policy differs from the ESXi UAT baseline; publish a new version instead of overwriting it',
          );
        unchanged.push(family);
        continue;
      }

      await tx.unsafe(
        'insert into policy_versions(family,version,effective_from,status,body,body_hash,legal_references,published_at) values($1,$2,$3,$4,$5,$6,$7,now())',
        [
          family,
          1,
          effectiveFrom,
          'published',
          tx.json(body as postgres.JSONValue),
          hash,
          tx.json(['Synthetic ESXi UAT policy baseline; not production cutover approval']),
        ],
      );
      inserted.push(family);
    }

    return { inserted, unchanged };
  });

  console.log(
    JSON.stringify({
      event: 'esxi_uat_policy_seed_complete',
      effectiveFrom,
      policyFamilies: Object.keys(policies).length,
      ...result,
      syntheticEmployeeData: false,
      productionApproval: false,
    }),
  );
} finally {
  await sql.end();
}
