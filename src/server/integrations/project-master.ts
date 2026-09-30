import { randomUUID } from 'node:crypto';
import { invariant, type Json } from '../../domain/core';
import { config } from '../config';
import { db } from '../db';
import { outlookGraphJson } from './outlook-auth';

type Fields = Record<string, unknown>;
interface LookupSource {
  lookupIdField: string;
  listId: string;
  valueField: string;
}
type TextSource = string | LookupSource;
interface ColumnMap {
  code: string;
  name: string;
  customer?: TextSource;
  salesOwner?: TextSource;
  engineerLead?: TextSource;
  startDate?: string;
  endDate?: string;
  poNumber?: string;
  poDate?: string;
  poCreateDate?: string;
  status: string;
  costCenter?: TextSource;
  activeValues: string[];
}
interface Runtime {
  tenantId: string;
  siteId: string;
  listId: string;
  columns: ColumnMap;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(map: Record<string, unknown>, key: string): string | undefined {
  return nonEmpty(map[key]) ? (map[key] as string) : undefined;
}

function textSource(map: Record<string, unknown>, key: string): TextSource | undefined {
  const value = map[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (nonEmpty(value)) return value;
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'PROJECT_MASTER_MAPPING_INVALID',
    'การแมปคอลัมน์ Project Master ไม่ถูกต้อง',
    503,
  );
  const lookup = value as Record<string, unknown>;
  invariant(
    nonEmpty(lookup.lookupIdField) && nonEmpty(lookup.listId) && nonEmpty(lookup.valueField),
    'PROJECT_MASTER_MAPPING_INVALID',
    'การแมป lookup ของ Project Master ไม่ถูกต้อง',
    503,
  );
  return {
    lookupIdField: lookup.lookupIdField,
    listId: lookup.listId,
    valueField: lookup.valueField,
  };
}

function runtime(): Runtime {
  const c = config();
  invariant(
    c.PROJECT_MASTER_TENANT_ID &&
      c.PROJECT_MASTER_SITE_ID &&
      c.PROJECT_MASTER_LIST_ID &&
      c.PROJECT_MASTER_COLUMN_MAP &&
      c.OUTLOOK_CALENDAR_SYNC_ENABLED &&
      c.OUTLOOK_CALENDAR_TENANT_ID === c.PROJECT_MASTER_TENANT_ID &&
      c.OUTLOOK_CALENDAR_CLIENT_ID,
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

  return {
    tenantId: c.PROJECT_MASTER_TENANT_ID,
    siteId: c.PROJECT_MASTER_SITE_ID,
    listId: c.PROJECT_MASTER_LIST_ID,
    columns: {
      code: map.code,
      name: map.name,
      status: map.status,
      activeValues: map.activeValues as string[],
      customer: textSource(map, 'customer'),
      salesOwner: textSource(map, 'salesOwner'),
      engineerLead: textSource(map, 'engineerLead'),
      startDate: optionalString(map, 'startDate'),
      endDate: optionalString(map, 'endDate'),
      poNumber: optionalString(map, 'poNumber'),
      poDate: optionalString(map, 'poDate'),
      poCreateDate: optionalString(map, 'poCreateDate'),
      costCenter: textSource(map, 'costCenter'),
    },
  };
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
async function readListItems(siteId: string, listId: string) {
  let url = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items?$expand=fields&$top=200`;
  const rows: Array<{ id: string; etag: string | null; fields: Fields }> = [];
  for (let page = 0; page < 100; page++) {
    const payload = (await outlookGraphJson(url)) as {
      value?: unknown;
      '@odata.nextLink'?: unknown;
    };
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

function lookupKey(source: LookupSource): string {
  return `${source.listId}\u0000${source.valueField}`;
}

function lookupSources(value: Runtime): LookupSource[] {
  const sources = [
    value.columns.customer,
    value.columns.salesOwner,
    value.columns.engineerLead,
    value.columns.costCenter,
  ];
  return sources.filter((source): source is LookupSource =>
    Boolean(source && typeof source !== 'string'),
  );
}

async function lookupTables(value: Runtime) {
  const tables = new Map<string, Map<string, string>>();
  const seen = new Set<string>();
  for (const source of lookupSources(value)) {
    const key = lookupKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    const items = await readListItems(value.siteId, source.listId);
    const table = new Map<string, string>();
    for (const item of items) {
      const resolved = textField(item.fields, source.valueField);
      if (resolved) table.set(item.id, resolved);
    }
    tables.set(key, table);
  }
  return tables;
}

function mappedTextField(
  fields: Fields,
  source: TextSource | undefined,
  tables: Map<string, Map<string, string>>,
): string | null {
  if (!source) return null;
  if (typeof source === 'string') return textField(fields, source);
  const lookupId = textField(fields, source.lookupIdField);
  if (!lookupId) return null;
  const resolved = tables.get(lookupKey(source))?.get(lookupId) ?? null;
  invariant(
    resolved,
    'PROJECT_MASTER_LOOKUP_UNRESOLVED',
    'Project Master มี lookup ที่อ้างอิงข้อมูลไม่ได้ จึงไม่ซิงก์ข้อมูลบางส่วน',
    503,
  );
  return resolved;
}
export async function syncProjectMaster(now = new Date()) {
  const value = runtime();
  const [items, lookups] = await Promise.all([
    readListItems(value.siteId, value.listId),
    lookupTables(value),
  ]);
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
      customer: mappedTextField(item.fields, value.columns.customer, lookups),
      salesOwner: mappedTextField(item.fields, value.columns.salesOwner, lookups),
      engineerLead: mappedTextField(item.fields, value.columns.engineerLead, lookups),
      startDate: dateField(item.fields, value.columns.startDate),
      endDate: dateField(item.fields, value.columns.endDate),
      poNumber: textField(item.fields, value.columns.poNumber),
      poDate: dateField(item.fields, value.columns.poDate),
      poCreateDate: dateField(item.fields, value.columns.poCreateDate),
      status: activeValues.has(sourceStatus.toLowerCase()) ? 'active' : 'inactive',
      costCenter: mappedTextField(item.fields, value.columns.costCenter, lookups),
    };
  });
  const correlationId = randomUUID();
  return db().begin(async (tx) => {
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      const changed = await tx`
        insert into project_references(source,source_tenant_id,source_site_id,source_list_id,source_item_id,
          code,name,customer,sales_owner,engineer_lead,start_date,end_date,po_number,po_date,po_create_date,
          status,cost_center,source_etag,last_synced_at)
        values('microsoft_lists',${value.tenantId},${value.siteId},${value.listId},${row.sourceItemId},
          ${row.code},${row.name},${row.customer},${row.salesOwner},${row.engineerLead},${row.startDate},${row.endDate},
          ${row.poNumber},${row.poDate},${row.poCreateDate},${row.status},${row.costCenter},${row.sourceEtag},${now})
        on conflict(source_tenant_id,source_site_id,source_list_id,source_item_id)
        do update set code=excluded.code,name=excluded.name,customer=excluded.customer,sales_owner=excluded.sales_owner,
          engineer_lead=excluded.engineer_lead,start_date=excluded.start_date,end_date=excluded.end_date,
          po_number=excluded.po_number,po_date=excluded.po_date,po_create_date=excluded.po_create_date,status=excluded.status,
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
