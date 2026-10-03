import type { Actor } from '../domain/core';
import { db } from './db';

export interface AuditTimelineRow {
  id: string;
  occurredAt: Date;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  revision: number | null;
  summary: string;
}

const actionLabels: Record<string, string> = {
  'request.submitted': 'ส่งคำขอ',
  'request.resubmitted': 'ส่งคำขอที่แก้ไขอีกครั้ง',
  'request.head_approved': 'หัวหน้าอนุมัติ',
  'request.head_returned': 'หัวหน้าส่งกลับแก้ไข',
  'request.head_rejected': 'หัวหน้าไม่อนุมัติ',
  'request.finance_verified': 'Finance ตรวจสอบแล้ว',
  'request.finance_returned': 'Finance ส่งกลับแก้ไข',
  'request.cancelled': 'ยกเลิกคำขอ',
  'integration.project_master_synced': 'ซิงก์ Project Master',
  'monthly_period.transitioned': 'เปลี่ยนสถานะรอบเดือน',
};

function redactedSummary(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '-';
  const value = metadata as Record<string, unknown>;
  const safeKeys = ['from', 'to', 'month', 'family', 'kind', 'state', 'reason'];
  const parts = safeKeys
    .filter((key) => typeof value[key] === 'string')
    .map((key) => `${key}: ${String(value[key]).slice(0, 120)}`);
  return parts.join(' · ') || '-';
}

export async function auditTimeline(actor: Actor, limit = 100): Promise<AuditTimelineRow[]> {
  const canSeeOrganization = actor.roles.includes('admin') || actor.roles.includes('finance');
  const rows = canSeeOrganization
    ? await db()`
        select a.id,a.occurred_at,a.action,a.entity_type,a.entity_id,a.revision,a.metadata,
               coalesce(e.display_name,'System') as actor_name
        from audit_events a
        left join employees e on e.id=a.actor_id
        order by a.occurred_at desc,a.id desc
        limit ${limit}
      `
    : await db()`
        select a.id,a.occurred_at,a.action,a.entity_type,a.entity_id,a.revision,a.metadata,
               coalesce(e.display_name,'System') as actor_name
        from audit_events a
        left join employees e on e.id=a.actor_id
        where a.actor_id=${actor.id}
           or (
             a.entity_type='request'
             and exists (
               select 1 from requests r
               where r.id::text=a.entity_id and r.employee_id=${actor.id}
             )
           )
        order by a.occurred_at desc,a.id desc
        limit ${limit}
      `;

  return rows.map((row) => ({
    id: String(row.id),
    occurredAt: new Date(row.occurred_at),
    actorName: String(row.actor_name),
    action: actionLabels[String(row.action)] ?? String(row.action).replaceAll('_', ' '),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    revision: row.revision === null ? null : Number(row.revision),
    summary: redactedSummary(row.metadata),
  }));
}
