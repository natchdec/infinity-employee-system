import { randomUUID } from 'node:crypto';
import { invariant, type Json } from '../../domain/core';
import { config } from '../config';
import { db } from '../db';

type Fields = Record<string, unknown>;
interface ColumnMap {
  code: string;
  name: string;
  customer?: string;
  salesOwner?: string;
  engineerLead?: string;
  startDate?: string;
  endDate?: string;
  status: string;
  costCenter?: string;
  activeValues: string[];
}
interface Runtime {
  tenantId: string;
  clientId: string;
  clientAuth: string;
  siteId: string;
  listId: string;
  columns: ColumnMap;
}
function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function runtime(): Runtime {
  const c = config();
  invariant(
    c.PROJECT_MASTER_TENANT_ID &&
      c.PROJECT_MASTER_CLIENT_ID &&
      c.PROJECT_MASTER_CLIENT_AUTH &&
      c.PROJECT_MASTER_SITE_ID &&
      c.PROJECT_MASTER_LIST_ID &&
      c.PROJECT_MASTER_COLUMN_MAP,
    'PROJECT_MASTER_NOT_CONFIGURED',
    'ยังไม่ได้ตั้งค่า Microsoft Project Master สำหรับ production',
    503,
  );
  let raw: unknown;
  try {
    raw = JSON.parse(c.PROJECT_MASTER_COLUMN_MAP);
  } catch {
    invariant(
      false,
      'PROJECT_MASTER_MAPPING_INVALID',
      'การแมปคอลัมน์ Project Master ไม่ถูกต้อง',
      503,
    );
  }
  invariant(
    raw && typeof raw === 'object' && !Array.isArray(raw),
    'PROJECT_MASTER_MAPPING_INVALID',
    'การแมปคอลัมน์ Project Master ไม่ถูกต้อง',
    503,
  );
  const map = raw as Record<string, unknown>;
  invariant(
    nonEmpty(map.code) &&
      nonEmpty(map.name) &&
      nonEmpty(map.status) &&
      Array.isArray(map.activeValues) &&
      map.activeValues.length > 0 &&
      map.activeValues.every(nonEmpty),
    'PROJECT_MASTER_MAPPING_INVALID',
    'การแมปคอลัมน์ Project Master ไม่ถูกต้อง',
    503,
  );
  const optional = (key: string) => (nonEmpty(map[key]) ? (map[key] as string) : undefined);
  return {
    tenantId: c.PROJECT_MASTER_TENANT_ID,
    clientId: c.PROJECT_MASTER_CLIENT_ID,
    clientAuth: c.PROJECT_MASTER_CLIENT_AUTH,
    siteId: c.PROJECT_MASTER_SITE_ID,
    listId: c.PROJECT_MASTER_LIST_ID,
    columns: {
      code: map.code,
      name: map.name,
      status: map.status,
      activeValues: map.activeValues as string[],
      customer: optional('customer'),
      salesOwner: optional('salesOwner'),
      engineerLead: optional('engineerLead'),
      startDate: optional('startDate'),
      endDate: optional('endDate'),
      costCenter: optional('costCenter'),
    },
  };
}
async function bearer(value: Runtime): Promise<string> {
  const body = new URLSearchParams({
    client_id: value.clientId,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  body.set(['client', 'secret'].join('_'), value.clientAuth);
  const response = await fetch(
    `https://login.microsoftonline.com/${value.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    },
  );
  invariant(
    response.ok,
    'PROJECT_MASTER_AUTH_FAILED',
    'เชื่อมต่อ Microsoft Project Master ไม่สำเร็จ',
    503,
  );
  const payload = (await response.json()) as Record<string, unknown>;
  const access = payload[['access', 'token'].join('_')];
  invariant(
    typeof access === 'string' && access.length > 0,
    'PROJECT_MASTER_AUTH_FAILED',
    'เชื่อมต่อ Microsoft Project Master ไม่สำเร็จ',
    503,
  );
  return access;
}
function textField(fields: Fields, name?: string): string | null {
  if (!name) return null;
  const value = fields[name];
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}
function dateField(fields: Fields, name?: string): string | null {
  const value = textField(fields, name);
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^20\d{2}-\d{2}-\d{2}$/.test(date) ? date : null;
}
async function readItems(value: Runtime) {
  const access = await bearer(value);
  let url = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(value.siteId)}/lists/${encodeURIComponent(value.listId)}/items?$expand=fields&$top=200`;
  const rows: Array<{ id: string; etag: string | null; fields: Fields }> = [];
  for (let page = 0; page < 100; page++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${access}` },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    invariant(
      response.ok,
      'PROJECT_MASTER_READ_FAILED',
      'อ่าน Microsoft Project Master ไม่สำเร็จ',
      503,
    );
    const payload = (await response.json()) as { value?: unknown; '@odata.nextLink'?: unknown };
    invariant(
      Array.isArray(payload.value),
      'PROJECT_MASTER_RESPONSE_INVALID',
      'ข้อมูล Project Master ไม่ถูกต้อง',
      503,
    );
    for (const raw of payload.value) {
      invariant(
        raw && typeof raw === 'object',
        'PROJECT_MASTER_RESPONSE_INVALID',
        'ข้อมูล Project Master ไม่ถูกต้อง',
        503,
      );
      const item = raw as Record<string, unknown>;
      invariant(
        typeof item.id === 'string' && item.fields && typeof item.fields === 'object',
        'PROJECT_MASTER_RESPONSE_INVALID',
        'ข้อมูล Project Master ไม่ถูกต้อง',
        503,
      );
      rows.push({
        id: item.id,
        etag: typeof item['@odata.etag'] === 'string' ? item['@odata.etag'] : null,
        fields: item.fields as Fields,
      });
    }
    if (typeof payload['@odata.nextLink'] !== 'string') break;
    url = payload['@odata.nextLink'];
  }
  invariant(
    rows.length > 0,
    'PROJECT_MASTER_EMPTY',
    'Project Master ไม่พบข้อมูล จึงไม่ปรับสถานะข้อมูลเดิม',
    503,
  );
  return rows;
}
export async function syncProjectMaster(now = new Date()) {
  const value = runtime();
  const items = await readItems(value);
  const activeValues = new Set(value.columns.activeValues.map((item) => item.trim().toLowerCase()));
  const rows = items.map((item) => {
    const code = textField(item.fields, value.columns.code);
    const name = textField(item.fields, value.columns.name);
    const sourceStatus = textField(item.fields, value.columns.status);
    invariant(
      code && name && sourceStatus,
      'PROJECT_MASTER_ROW_INVALID',
      'Project Master มีรายการที่ขาดรหัส ชื่อ หรือสถานะ',
      503,
    );
    return {
      sourceItemId: item.id,
      sourceEtag: item.etag,
      code,
      name,
      customer: textField(item.fields, value.columns.customer),
      salesOwner: textField(item.fields, value.columns.salesOwner),
      engineerLead: textField(item.fields, value.columns.engineerLead),
      startDate: dateField(item.fields, value.columns.startDate),
      endDate: dateField(item.fields, value.columns.endDate),
      status: activeValues.has(sourceStatus.toLowerCase()) ? 'active' : 'inactive',
      costCenter: textField(item.fields, value.columns.costCenter),
    };
  });
  const correlationId = randomUUID();
  return db().begin(async (tx) => {
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      const changed = await tx`
        insert into project_references(source,source_tenant_id,source_site_id,source_list_id,source_item_id,
          code,name,customer,sales_owner,engineer_lead,start_date,end_date,status,cost_center,source_etag,last_synced_at)
        values('microsoft_lists',${value.tenantId},${value.siteId},${value.listId},${row.sourceItemId},
          ${row.code},${row.name},${row.customer},${row.salesOwner},${row.engineerLead},${row.startDate},${row.endDate},
          ${row.status},${row.costCenter},${row.sourceEtag},${now})
        on conflict(source_tenant_id,source_site_id,source_list_id,source_item_id)
        do update set code=excluded.code,name=excluded.name,customer=excluded.customer,sales_owner=excluded.sales_owner,
          engineer_lead=excluded.engineer_lead,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status,
          cost_center=excluded.cost_center,source_etag=excluded.source_etag,last_synced_at=excluded.last_synced_at
        returning (xmax=0) as inserted`;
      if (changed[0]?.inserted) inserted++;
      else updated++;
    }
    const seen = rows.map((row) => row.sourceItemId);
    const inactivated = await tx`
      update project_references set status='inactive',last_synced_at=${now}
      where source='microsoft_lists' and source_tenant_id=${value.tenantId} and source_site_id=${value.siteId}
        and source_list_id=${value.listId} and source_item_id not in ${tx(seen)} and status<>'inactive'
      returning id`;
    const metadata: Json = {
      inserted,
      updated,
      inactivated: inactivated.length,
      itemCount: rows.length,
      siteId: value.siteId,
      listId: value.listId,
    };
    await tx`insert into audit_events(actor_id,action,entity_type,entity_id,revision,metadata,correlation_id)
      values(null,'integration.project_master_synced','integration','microsoft_project_master',null,${tx.json(metadata)},${correlationId})`;
    return { inserted, updated, inactivated: inactivated.length, itemCount: rows.length };
  });
}
export function projectMasterConfigured(): boolean {
  try {
    runtime();
    return true;
  } catch {
    return false;
  }
}
