import type postgres from 'postgres';
import { connectDatabase } from '../src/server/connection';
import { fingerprint } from '../src/domain/core';
import {
  calendar,
  otPolicy,
  leavePolicy,
  mileagePolicy,
  perDiemPolicy,
  expensePolicy,
} from '../tests/fixtures';
import { validateLegalFloors, type PolicyFamily } from '../src/domain/policy';

if (!['uat', 'test'].includes(process.env.APP_ENV ?? '') || process.env.UAT_SEED_ALLOWED !== 'true')
  throw new Error('Synthetic seed requires explicit UAT/test opt-in');
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('UAT database owner connection is required');
const target = new URL(url);
if (!/^\/ies_(uat|test[a-z0-9_]*)$/.test(target.pathname))
  throw new Error('Refusing a non-UAT database name');
if (!['localhost', '127.0.0.1'].includes(target.hostname))
  throw new Error('Refusing a non-loopback UAT target');
const sql = connectDatabase(url, { max: 1, applicationName: 'infinity-employee-synthetic-seed' });
export const fixtureIds = {
  employee: '10000000-0000-4000-8000-000000000001',
  head: '10000000-0000-4000-8000-000000000002',
  employeeOther: '10000000-0000-4000-8000-000000000003',
  headOther: '10000000-0000-4000-8000-000000000004',
  finance: '10000000-0000-4000-8000-000000000005',
  financeOther: '10000000-0000-4000-8000-000000000006',
  project: '30000000-0000-4000-8000-000000000001',
};
const people = [
  {
    id: fixtureIds.employee,
    name: 'พนักงานทดสอบ ก',
    email: 'employee.a@example.invalid',
    roles: ['employee'],
    owner: false,
    department: 'engineering',
  },
  {
    id: fixtureIds.head,
    name: 'หัวหน้าทดสอบ ก',
    email: 'head.a@example.invalid',
    roles: ['employee', 'head'],
    owner: true,
    department: 'engineering',
  },
  {
    id: fixtureIds.employeeOther,
    name: 'พนักงานทดสอบ ข',
    email: 'employee.b@example.invalid',
    roles: ['employee'],
    owner: false,
    department: 'sales',
  },
  {
    id: fixtureIds.headOther,
    name: 'หัวหน้าทดสอบ ข',
    email: 'head.b@example.invalid',
    roles: ['employee', 'head'],
    owner: true,
    department: 'sales',
  },
  {
    id: fixtureIds.finance,
    name: 'การเงินทดสอบ ก',
    email: 'finance.a@example.invalid',
    roles: ['employee', 'head', 'finance', 'admin'],
    owner: true,
    department: 'finance',
  },
  {
    id: fixtureIds.financeOther,
    name: 'การเงินทดสอบ ข',
    email: 'finance.b@example.invalid',
    roles: ['employee', 'finance'],
    owner: false,
    department: 'finance',
  },
];
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
try {
  await sql.begin(async (tx) => {
    const existing = await tx`select id from employees`;
    if (existing.some((row) => !people.some((person) => person.id === row.id)))
      throw new Error('UAT database contains an unrecognized roster; seed will not alter it');
    for (const [code, name] of [
      ['engineering', 'วิศวกรรมทดสอบ'],
      ['sales', 'ฝ่ายขายทดสอบ'],
      ['finance', 'การเงินทดสอบ'],
    ])
      await tx`insert into departments(code,name) values(${code!},${name!}) on conflict(code) do nothing`;
    for (const person of people) {
      const [department] = await tx`select id from departments where code=${person.department}`;
      await tx`insert into employees(id,tenant_id,entra_object_id,email,display_name,department_id,hire_date,is_head_owner) values(${person.id},'00000000-0000-4000-8000-000000000001',${person.id},${person.email},${person.name},${department!.id},'2024-01-01',${person.owner}) on conflict(id) do nothing`;
    }
    for (const person of people) {
      for (const role of person.roles)
        await tx`insert into employee_roles(employee_id,role) values(${person.id},${role}) on conflict do nothing`;
      await tx`insert into wage_versions(employee_id,effective_from,monthly_satang,normal_daily_hours,ot_eligibility) values(${person.id},'2024-01-01',3000000,8,'eligible') on conflict(employee_id,effective_from) do nothing`;
      await tx`insert into commute_versions(employee_id,effective_from,distance_metres,verified_by) values(${person.id},'2024-01-01',20000,${fixtureIds.finance}) on conflict(employee_id,effective_from) do nothing`;
    }
    for (const [employeeId, headId] of [
      [fixtureIds.employee, fixtureIds.head],
      [fixtureIds.employeeOther, fixtureIds.headOther],
      [fixtureIds.financeOther, fixtureIds.finance],
    ])
      await tx`insert into reporting_lines(employee_id,head_id,effective_from) values(${employeeId!},${headId!},'2024-01-01') on conflict(employee_id,effective_from) do nothing`;
    await tx`insert into project_references(id,source,source_tenant_id,source_site_id,source_list_id,source_item_id,code,name,customer,status,cost_center,last_synced_at) values(${fixtureIds.project},'synthetic_uat','synthetic','synthetic','synthetic','1','UAT-026','โครงการทดสอบระบบเครือข่าย','ลูกค้าสมมติ','active','UAT',now()) on conflict(id) do nothing`;
    for (const [family, body] of Object.entries(policies)) {
      validateLegalFloors(family as PolicyFamily, body);
      const hash = fingerprint(body);
      const [old] =
        await tx`select body_hash from policy_versions where family=${family} and version=1`;
      if (old && old.body_hash !== hash)
        throw new Error('Synthetic published policy drift requires a new version, not overwrite');
      await tx`insert into policy_versions(family,version,effective_from,status,body,body_hash,legal_references,published_at) values(${family},1,'2024-01-01','published',${tx.json(body as postgres.JSONValue)},${hash},${tx.json(['Synthetic UAT policy, not approved production configuration'])},now()) on conflict(family,version) do nothing`;
    }
  });
  console.log(
    JSON.stringify({
      event: 'synthetic_seed_complete',
      employeeFixtures: people.length,
      policyFamilies: Object.keys(policies).length,
      realEmployeeData: false,
    }),
  );
} finally {
  await sql.end();
}
