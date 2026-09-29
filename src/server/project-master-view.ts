import { db } from './db';
import { projectMasterConfigured } from './integrations/project-master';

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
  source: string;
  sourceEtag: string | null;
  lastSyncedAt: Date;
}

export interface ProjectMasterSummary {
  total: number;
  active: number;
  inactive: number;
  missingEngineerLead: number;
  missingCostCenter: number;
  lastSyncedAt: Date | null;
  configured: boolean;
}

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
    source: String(row.source),
    sourceEtag: row.source_etag ? String(row.source_etag) : null,
    lastSyncedAt: new Date(row.last_synced_at as Date),
  };
}

export async function projectMasterSummary(): Promise<ProjectMasterSummary> {
  const [row] = await db()`
    select
      count(*)::integer as total,
      count(*) filter (where status='active')::integer as active,
      count(*) filter (where status='inactive')::integer as inactive,
      count(*) filter (where engineer_lead is null or btrim(engineer_lead)='')::integer as missing_engineer_lead,
      count(*) filter (where cost_center is null or btrim(cost_center)='')::integer as missing_cost_center,
      max(last_synced_at) as last_synced_at
    from project_references
    where source='microsoft_lists'
  `;
  return {
    total: Number(row?.total ?? 0),
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
  const rows = await db()`
    select id,code,name,customer,sales_owner,engineer_lead,start_date::text,end_date::text,
      status,cost_center,source,source_etag,last_synced_at
    from project_references
    where source='microsoft_lists'
      and (${status}='all' or status=${status})
      and (
        ${needle}='' or
        code ilike ${like} or
        name ilike ${like} or
        coalesce(customer,'') ilike ${like} or
        coalesce(sales_owner,'') ilike ${like}
      )
    order by case when status='active' then 0 else 1 end, code, name
    limit ${limit}
  `;
  return rows.map((row) => mapProject(row as Record<string, unknown>));
}

export async function projectMasterDetail(id: string): Promise<ProjectMasterRow | null> {
  const [row] = await db()`
    select id,code,name,customer,sales_owner,engineer_lead,start_date::text,end_date::text,
      status,cost_center,source,source_etag,last_synced_at
    from project_references
    where id=${id} and source='microsoft_lists'
  `;
  return row ? mapProject(row as Record<string, unknown>) : null;
}
