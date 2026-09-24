import { bangkokDate } from '../domain/calendar';
import { invariant, type Actor, type Json } from '../domain/core';
import { canViewRequest, type RequestKind, type RequestRecord } from '../domain/requests';
import type { ExpensePolicy, LeavePolicy, OTPolicy, PerDiemPolicy } from '../domain/policy';
import { db, policyFor, safeJson } from './db';
import { requestFromRow } from './request-record';

export interface RequestFormOptions {
  projects: { id: string; code: string; name: string; customer: string | null }[];
  leaveTypes: {
    id: string;
    label: string;
    evidenceRequired: boolean;
    period: 'year' | 'event';
  }[];
  otCategories: {
    id: string;
    label: string;
    dayKind: 'working' | 'holiday';
    multiplierBasisPoints: number;
  }[];
  expenseCategories: {
    id: string;
    label: string;
    evidenceRequired: boolean;
    originalRequired: boolean;
  }[];
  perDiem: {
    domesticRateSatang: string | null;
    internationalRateSatang: string | null;
    settlementDueDays: number;
  };
  approvedTrips: {
    id: string;
    reference: string;
    title: string;
    businessDate: string;
  }[];
}

export async function requestFormOptions(actor: Actor): Promise<RequestFormOptions> {
  const date = bangkokDate(new Date());
  const [leave, ot, expense, perDiem] = await Promise.all([
    policyFor<LeavePolicy>(db(), 'leave', date),
    policyFor<OTPolicy>(db(), 'ot', date),
    policyFor<ExpensePolicy>(db(), 'expense', date),
    policyFor<PerDiemPolicy>(db(), 'per_diem', date),
  ]);
  const projects = await db()`
    select id,code,name,customer
    from project_references
    where status='active'
      and (${process.env.APP_ENV === 'production'} = false or source='microsoft_lists')
    order by code,name
    limit 500
  `;
  const trips = await db()`
    select r.id,r.reference,r.title,r.business_date::text
    from requests r
    where r.employee_id=${actor.id}
      and r.kind='trip'
      and r.workflow_state='approved'
      and not exists(
        select 1 from settlements s
        where s.trip_id=r.id and s.state not in ('returned','void')
      )
    order by r.business_date desc
    limit 100
  `;
  return {
    projects: projects.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      customer: row.customer,
    })),
    leaveTypes: leave.body.types.map((type) => ({
      id: type.id,
      label: type.label,
      evidenceRequired: type.evidenceRequired,
      period: type.period,
    })),
    otCategories: ot.body.categories.map((category) => ({
      id: category.id,
      label: category.label,
      dayKind: category.dayKind,
      multiplierBasisPoints: category.multiplierBasisPoints,
    })),
    expenseCategories: expense.body.categories
      .filter((category) => category.enabled)
      .map((category) => ({
        id: category.id,
        label: category.label,
        evidenceRequired: category.evidenceRequired,
        originalRequired: category.originalRequired,
      })),
    perDiem: {
      domesticRateSatang: perDiem.body.domesticRateSatang,
      internationalRateSatang: perDiem.body.internationalRateSatang,
      settlementDueDays: perDiem.body.settlementDueDays,
    },
    approvedTrips: trips.map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      businessDate: row.business_date,
    })),
  };
}

export interface RequestDetail {
  request: RequestRecord & { employeeName: string; employeeEmail: string };
  payload: Record<string, Json>;
  calculation: Record<string, Json>;
  policySnapshots: Json;
  actions: {
    action: string;
    actorName: string | null;
    reason: string | null;
    occurredAt: string;
  }[];
  originalReceipt: {
    state: 'not_required' | 'outstanding' | 'received';
    revision: number;
    receivedAt: string | null;
  } | null;
  settlement: {
    id: string;
    state: string;
    revision: number;
    actualSatang: string;
    paidAdvanceSatang: string;
    netSatang: string;
    dueDate: string;
  } | null;
}

export async function requestDetail(actor: Actor, id: string): Promise<RequestDetail> {
  const [row] = await db()`
    select r.*,e.display_name,e.email
    from requests r
    join employees e on e.id=r.employee_id
    where r.id=${id}
  `;
  invariant(row, 'NOT_FOUND', 'ไม่พบรายการ', 404);
  const request = requestFromRow(row as Record<string, unknown>);
  invariant(canViewRequest(actor, request), 'NOT_FOUND', 'ไม่พบรายการ', 404);
  const [revision] = await db()`
    select payload,calculation,policy_snapshots
    from request_revisions
    where request_id=${id} and round=${request.submission_round}
  `;
  invariant(revision, 'REQUEST_REVISION_MISSING', 'ไม่พบ snapshot ของรายการ', 500);
  const actions = await db()`
    select a.action,a.reason,a.occurred_at,e.display_name
    from approval_actions a
    left join employees e on e.id=a.actor_id
    where a.request_id=${id}
    order by a.occurred_at,a.id
  `;
  const [receipt] = await db()`
    select state,revision,received_at
    from original_receipts
    where request_id=${id}
  `;
  const settlementId = request.kind === 'trip' ? request.id : request.parent_trip_id;
  let settlement: RequestDetail['settlement'] = null;
  if (settlementId) {
    const [rowSettlement] = await db()`
      select id,state,revision,actual_satang::text,paid_advance_satang::text,net_satang::text,due_date::text
      from settlements
      where trip_id=${settlementId} and state not in ('returned','void')
      order by created_at desc
      limit 1
    `;
    if (rowSettlement) {
      settlement = {
        id: rowSettlement.id,
        state: rowSettlement.state,
        revision: rowSettlement.revision,
        actualSatang: rowSettlement.actual_satang,
        paidAdvanceSatang: rowSettlement.paid_advance_satang,
        netSatang: rowSettlement.net_satang,
        dueDate: rowSettlement.due_date,
      };
    }
  }
  return {
    request: {
      ...request,
      employeeName: row.display_name,
      employeeEmail: row.email,
    },
    payload: safeJson(revision.payload) as Record<string, Json>,
    calculation: safeJson(revision.calculation) as Record<string, Json>,
    policySnapshots: safeJson(revision.policy_snapshots),
    actions: actions.map((action) => ({
      action: action.action,
      actorName: action.display_name ?? null,
      reason: action.reason ?? null,
      occurredAt: new Date(action.occurred_at).toISOString(),
    })),
    originalReceipt: receipt
      ? {
          state: receipt.state,
          revision: receipt.revision,
          receivedAt: receipt.received_at ? new Date(receipt.received_at).toISOString() : null,
        }
      : null,
    settlement,
  };
}

export function kindLabel(kind: RequestKind): string {
  return {
    leave: 'ลา',
    ot: 'OT',
    expense: 'ค่าใช้จ่าย',
    trip: 'เดินทาง',
    advance: 'เงินทดรอง',
  }[kind];
}
