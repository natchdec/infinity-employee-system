import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { connectDatabase } from '../src/server/connection';

if (process.env.APP_ENV !== 'uat' || process.env.PROJECT_MASTER_SNAPSHOT_IMPORT_ALLOWED !== 'true')
  throw new Error('Project Master snapshot import requires APP_ENV=uat and explicit opt-in');

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is required');
const target = new URL(url);
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  (target.hostname !== 'db' && target.hostname !== '127.0.0.1') ||
  target.pathname !== '/infinity_employee'
)
  throw new Error('Refusing to import outside the dedicated ESXi UAT database');

const expectedDigest = process.env.PROJECT_MASTER_SNAPSHOT_SHA256;
if (!expectedDigest || !/^[a-f0-9]{64}$/i.test(expectedDigest))
  throw new Error('PROJECT_MASTER_SNAPSHOT_SHA256 is required');

const snapshotPath = process.argv[2] || '/data/project-master-snapshot.json.gz';
const compressed = await readFile(snapshotPath);
const actualDigest = createHash('sha256').update(compressed).digest('hex');
if (actualDigest !== expectedDigest.toLowerCase())
  throw new Error('Project Master snapshot digest mismatch');

const rowSchema = z
  .object({
    sourceItemId: z.string().min(1),
    sourceEtag: z.string().nullable(),
    code: z.string().min(1),
    name: z.string().min(1),
    customer: z.string().min(1),
    salesOwner: z.string().min(1),
    engineerLead: z.string().min(1).nullable(),
    startDate: z
      .string()
      .regex(/^20\d{2}-\d{2}-\d{2}$/)
      .nullable(),
    endDate: z
      .string()
      .regex(/^20\d{2}-\d{2}-\d{2}$/)
      .nullable(),
    status: z.enum(['active', 'inactive']),
    costCenter: z.string().min(1).nullable(),
  })
  .strict();

const snapshotSchema = z
  .object({
    generatedAt: z.string().datetime(),
    tenantId: z.string().uuid(),
    siteId: z.string().min(1),
    listId: z.string().min(1),
    rows: z.array(rowSchema).min(1).max(5000),
  })
  .strict();

const parsed = snapshotSchema.parse(JSON.parse(gunzipSync(compressed).toString('utf8')));
const seen = new Set<string>();
for (const row of parsed.rows) {
  if (seen.has(row.sourceItemId)) throw new Error('Duplicate Project Master source item id');
  seen.add(row.sourceItemId);
}
const syncedAt = new Date(parsed.generatedAt);
if (Number.isNaN(syncedAt.getTime())) throw new Error('Invalid Project Master generatedAt');

const sql = connectDatabase(url, {
  max: 1,
  applicationName: 'infinity-employee-project-master-snapshot-import',
});

try {
  const result = await sql.begin(async (tx) => {
    let inserted = 0;
    let updated = 0;
    for (const row of parsed.rows) {
      const changed = await tx`
        insert into project_references(
          source,source_tenant_id,source_site_id,source_list_id,source_item_id,
          code,name,customer,sales_owner,engineer_lead,start_date,end_date,status,cost_center,
          source_etag,last_synced_at
        )
        values(
          'microsoft_lists',${parsed.tenantId},${parsed.siteId},${parsed.listId},${row.sourceItemId},
          ${row.code},${row.name},${row.customer},${row.salesOwner},${row.engineerLead},
          ${row.startDate},${row.endDate},${row.status},${row.costCenter},${row.sourceEtag},${syncedAt}
        )
        on conflict(source_tenant_id,source_site_id,source_list_id,source_item_id)
        do update set
          code=excluded.code,
          name=excluded.name,
          customer=excluded.customer,
          sales_owner=excluded.sales_owner,
          engineer_lead=excluded.engineer_lead,
          start_date=excluded.start_date,
          end_date=excluded.end_date,
          status=excluded.status,
          cost_center=excluded.cost_center,
          source_etag=excluded.source_etag,
          last_synced_at=excluded.last_synced_at
        returning (xmax=0) as inserted
      `;
      if (changed[0]?.inserted) inserted++;
      else updated++;
    }

    const sourceIds = parsed.rows.map((row) => row.sourceItemId);
    const inactivated = await tx`
      update project_references
      set status='inactive',last_synced_at=${syncedAt}
      where source='microsoft_lists'
        and source_tenant_id=${parsed.tenantId}
        and source_site_id=${parsed.siteId}
        and source_list_id=${parsed.listId}
        and source_item_id not in ${tx(sourceIds)}
        and status<>'inactive'
      returning id
    `;

    await tx`
      insert into audit_events(
        actor_id,action,entity_type,entity_id,revision,metadata,correlation_id
      )
      values(
        null,
        'integration.project_master_snapshot_imported',
        'integration',
        'microsoft_project_master',
        null,
        ${tx.json({
          digest: actualDigest,
          generatedAt: parsed.generatedAt,
          itemCount: parsed.rows.length,
          inserted,
          updated,
          inactivated: inactivated.length,
          siteId: parsed.siteId,
          listId: parsed.listId,
        })},
        gen_random_uuid()
      )
    `;

    return { inserted, updated, inactivated: inactivated.length };
  });

  console.log(
    JSON.stringify({
      event: 'project_master_snapshot_import_complete',
      digest: actualDigest,
      generatedAt: parsed.generatedAt,
      itemCount: parsed.rows.length,
      active: parsed.rows.filter((row) => row.status === 'active').length,
      ...result,
    }),
  );
} finally {
  await sql.end();
}
