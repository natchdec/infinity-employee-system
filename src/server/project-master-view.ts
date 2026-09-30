import { db } from './db';
import { projectMasterConfigured } from './integrations/project-master';

export interface ProjectMasterLine {
  id: string;
  sourceItemId: string;
  code: string;
  name: string;
  customer: string | null;
  salesOwner: string | null;
  engineerLead: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  costCenter: string | null;
  poNumber: string | null;
  poDate: string | null;
  poCreateDate: string | null;
  sourceEtag: string | null;
  lastSyncedAt: Date;
}

export interface ProjectMasterRow {
  id: string;
  code: string;
  name: string;
  customer: string | null;
  salesOwner: string | null;
  engineerLead: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  costCenter: string | null;
  poNumber: string | null;
  poDate: string | null;
  poCreateDate: string | null;
  lineCount: number;
  source: string;
  sourceEtag: string | null;
  lastSyncedAt: Date;
}

export interface ProjectMasterDetail extends ProjectMasterRow {
  lines: ProjectMasterLine[];
}

export interface ProjectMasterSummary {
  total: number;
  sourceItems: number;
  active: number;
  inactive: number;
  missingEngineerLead: number;
  missingCostCenter: number;
  lastSyncedAt: Date | null;
  configured: boolean;
}

const groupKeySql = `coalesce(nullif(upper(btrim(po_number)),''),'ITEM:' || id::text)`;

function mapProject(row: Record<string, unknown>): ProjectMasterRow {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    customer: row.customer ? String(row.customer) : null,
    salesOwner: row.sales_owner ? String(row.sales_owner) : null,
    engineerLead: row.engineer_lead ? String(row.engineer_lead) : null,
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    status: String(row.status),
    costCenter: row.cost_center ? String(row.cost_center) : null,
    poNumber: row.po_number ? String(row.po_number) : null,
    poDate: row.po_date ? String(row.po_date) : null,
    poCreateDate: row.po_create_date ? String(row.po_create_date) : null,
    lineCount: Number(row.line_count ?? 1),
    source: String(row.source),
    sourceEtag: row.source_etag ? String(row.source_etag) : null,
    lastSyncedAt: new Date(row.last_synced_at as Date),
  };
}

function mapLine(row: Record<string, unknown>): ProjectMasterLine {
  return {
    id: String(row.id),
    sourceItemId: String(row.source_item_id),
    code: String(row.code),
    name: String(row.name),
    customer: row.customer ? String(row.customer) : null,
    salesOwner: row.sales_owner ? String(row.sales_owner) : null,
    engineerLead: row.engineer_lead ? String(row.engineer_lead) : null,
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    status: String(row.status),
    costCenter: row.cost_center ? String(row.cost_center) : null,
    poNumber: row.po_number ? String(row.po_number) : null,
    poDate: row.po_date ? String(row.po_date) : null,
    poCreateDate: row.po_create_date ? String(row.po_create_date) : null,
    sourceEtag: row.source_etag ? String(row.source_etag) : null,
    lastSyncedAt: new Date(row.last_synced_at as Date),
  };
}

export async function projectMasterSummary(): Promise<ProjectMasterSummary> {
  const [row] = await db().unsafe(`
    select
      count(distinct ${groupKeySql})::integer as total,
      count(*)::integer as source_items,
      count(distinct ${groupKeySql}) filter (where status='active')::integer as active,
      (
        count(distinct ${groupKeySql}) -
        count(distinct ${groupKeySql}) filter (where status='active')
      )::integer as inactive,
      count(*) filter (where engineer_lead is null or btrim(engineer_lead)='')::integer as missing_engineer_lead,
      count(*) filter (where cost_center is null or btrim(cost_center)='')::integer as missing_cost_center,
      max(last_synced_at) as last_synced_at
    from project_references
    where source='microsoft_lists'
  `);
  return {
    total: Number(row?.total ?? 0),
    sourceItems: Number(row?.source_items ?? 0),
    active: Number(row?.active ?? 0),
    inactive: Number(row?.inactive ?? 0),
    missingEngineerLead: Number(row?.missing_engineer_lead ?? 0),
    missingCostCenter: Number(row?.missing_cost_center ?? 0),
    lastSyncedAt: row?.last_synced_at ? new Date(row.last_synced_at as Date) : null,
    configured: projectMasterConfigured(),
  };
}

export async function listProjectMaster(
  search = '',
  status: 'all' | 'active' | 'inactive' = 'all',
  limit = 500,
): Promise<ProjectMasterRow[]> {
  const needle = search.trim();
  const like = `%${needle}%`;
  const rows = await db().unsafe(
    `
      select
        (array_agg(id order by source_item_id,id))[1] as id,
        (array_agg(code order by source_item_id,id))[1] as code,
        (array_agg(name order by source_item_id,id))[1] as name,
        (array_agg(customer order by source_item_id,id))[1] as customer,
        (array_agg(sales_owner order by source_item_id,id))[1] as sales_owner,
        (array_agg(engineer_lead order by source_item_id,id))[1] as engineer_lead,
        min(start_date)::text as start_date,
        max(end_date)::text as end_date,
        case when bool_or(status='active') then 'active' else 'inactive' end as status,
        (array_agg(cost_center order by source_item_id,id))[1] as cost_center,
        (array_agg(po_number order by source_item_id,id))[1] as po_number,
        min(po_date)::text as po_date,
        min(po_create_date)::text as po_create_date,
        count(*)::integer as line_count,
        'microsoft_lists'::text as source,
        (array_agg(source_etag order by source_item_id,id))[1] as source_etag,
        max(last_synced_at) as last_synced_at
      from project_references
      where source='microsoft_lists'
      group by ${groupKeySql}
      having
        ($1='all' or ($1='active' and bool_or(status='active')) or ($1='inactive' and not bool_or(status='active')))
        and (
          $2='' or
          bool_or(code ilike $3) or
          bool_or(name ilike $3) or
          bool_or(coalesce(customer,'') ilike $3) or
          bool_or(coalesce(sales_owner,'') ilike $3) or
          bool_or(coalesce(po_number,'') ilike $3)
        )
      order by
        case when bool_or(status='active') then 0 else 1 end,
        coalesce((array_agg(po_number order by source_item_id,id))[1],(array_agg(code order by source_item_id,id))[1]),
        (array_agg(name order by source_item_id,id))[1]
      limit $4
    `,
    [status, needle, like, limit],
  );
  return rows.map((row) => mapProject(row as Record<string, unknown>));
}

export async function projectMasterDetail(id: string): Promise<ProjectMasterDetail | null> {
  const [target] = await db().unsafe(
    `select ${groupKeySql} as group_key from project_references where id=$1 and source='microsoft_lists'`,
    [id],
  );
  if (!target) return null;
  const lines = await db().unsafe(
    `
      select id,source_item_id,code,name,customer,sales_owner,engineer_lead,start_date::text,end_date::text,
        status,cost_center,po_number,po_date::text,po_create_date::text,source_etag,last_synced_at
      from project_references
      where source='microsoft_lists' and ${groupKeySql}=$1
      order by source_item_id,id
    `,
    [String(target.group_key)],
  );
  if (!lines.length) return null;
  const mapped = lines.map((row) => mapLine(row as Record<string, unknown>));
  const first = mapped[0]!;
  const active = mapped.some((line) => line.status === 'active');
  const startDates = mapped
    .map((line) => line.startDate)
    .filter((value): value is string => Boolean(value));
  const endDates = mapped
    .map((line) => line.endDate)
    .filter((value): value is string => Boolean(value));
  const syncMs = Math.max(...mapped.map((line) => line.lastSyncedAt.getTime()));
  return {
    id: first.id,
    code: first.code,
    name: first.name,
    customer: first.customer,
    salesOwner: first.salesOwner,
    engineerLead: first.engineerLead,
    startDate: startDates.length ? startDates.sort()[0]! : null,
    endDate: endDates.length ? endDates.sort().at(-1)! : null,
    status: active ? 'active' : 'inactive',
    costCenter: first.costCenter,
    poNumber: mapped.find((line) => line.poNumber)?.poNumber ?? null,
    poDate: mapped.find((line) => line.poDate)?.poDate ?? null,
    poCreateDate: mapped.find((line) => line.poCreateDate)?.poCreateDate ?? null,
    lineCount: mapped.length,
    source: 'microsoft_lists',
    sourceEtag: first.sourceEtag,
    lastSyncedAt: new Date(syncMs),
    lines: mapped,
  };
}
