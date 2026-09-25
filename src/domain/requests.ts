import { z } from 'zod';
import { dateSchema, expenseCategories } from './policy';
import { invariant, type Actor } from './core';

const id = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const decimalAmount = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
const base = {
  title: z.string().trim().min(1).max(200),
  projectId: id.nullable().default(null),
  description: text,
};
export const mileageLegSchema = z
  .object({
    origin: z.enum(['home', 'office', 'customer', 'other']),
    destination: z.enum(['home', 'office', 'customer', 'other']),
    originLabel: z.string().trim().min(1).max(200),
    destinationLabel: z.string().trim().min(1).max(200),
    distanceMetres: z.number().int().min(1).max(3_000_000),
    source: z.enum(['manual_attested', 'google_routes']),
    providerReference: id.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'google_routes' && !value.providerReference)
      context.addIssue({
        code: 'custom',
        path: ['providerReference'],
        message: 'Google Routes ต้องมี route quote ที่ระบบออกให้',
      });
    if (value.source === 'manual_attested' && value.providerReference)
      context.addIssue({
        code: 'custom',
        path: ['providerReference'],
        message: 'การรับรองระยะทางด้วยตนเองต้องไม่มี provider reference',
      });
  });
export const expenseLineSchema = z
  .object({
    categoryId: z.enum(expenseCategories),
    date: dateSchema,
    description: text,
    amount: decimalAmount.optional(),
    documentIds: z.array(id).max(10).default([]),
    mileage: z.array(mileageLegSchema).max(20).optional(),
    entertainment: z
      .object({
        purpose: text,
        customer: z.string().trim().min(1).max(200),
        attendeeCount: z.number().int().min(1).max(200),
        attendeeContext: text,
      })
      .strict()
      .optional(),
  })
  .strict();
export const requestSchemas = {
  leave: z
    .object({
      ...base,
      kind: z.literal('leave'),
      typeId: z.string().regex(/^[a-z][a-z_]{1,40}$/),
      start: dateSchema,
      end: dateSchema,
      unit: z.literal('full_day'),
      eventReference: z.string().trim().min(3).max(200).optional(),
      documentIds: z.array(id).max(10).default([]),
    })
    .strict(),
  ot: z
    .object({
      ...base,
      kind: z.literal('ot'),
      date: dateSchema,
      task: z.string().trim().min(1).max(200),
      lines: z
        .array(
          z
            .object({
              categoryId: z.string().min(1).max(40),
              hours: z.number().int().min(1).max(24),
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict(),
  expense: z
    .object({
      ...base,
      kind: z.literal('expense'),
      parentTripId: id.nullable().default(null),
      lines: z.array(expenseLineSchema).min(1).max(50),
    })
    .strict(),
  trip: z
    .object({
      ...base,
      kind: z.literal('trip'),
      start: dateSchema,
      end: dateSchema,
      destination: z.string().trim().min(1).max(300),
      region: z.enum(['domestic', 'international']),
      requestPerDiem: z.boolean(),
      estimatedAmount: decimalAmount.default('0'),
      currency: z.literal('THB').default('THB'),
    })
    .strict(),
  advance: z
    .object({
      ...base,
      kind: z.literal('advance'),
      parentTripId: id,
      date: dateSchema,
      amount: decimalAmount,
    })
    .strict(),
};
export const requestInputSchema = z.discriminatedUnion('kind', [
  requestSchemas.leave,
  requestSchemas.ot,
  requestSchemas.expense,
  requestSchemas.trip,
  requestSchemas.advance,
]);
export type RequestInput = z.infer<typeof requestInputSchema>;
export type RequestKind = RequestInput['kind'];
export type RequestState =
  'draft' | 'pending_head' | 'approved' | 'returned' | 'rejected' | 'cancelled';
export interface RequestRecord {
  id: string;
  reference: string;
  kind: RequestKind;
  employee_id: string;
  project_reference_id: string | null;
  parent_trip_id: string | null;
  title: string;
  business_date: string;
  draft_payload: Record<string, unknown>;
  revision: number;
  submission_round: number;
  workflow_state: RequestState;
  finance_state: 'not_required' | 'pending' | 'verified' | 'returned';
  payment_state: 'not_applicable' | 'unpaid' | 'allocated' | 'paid';
  total_satang: string;
  currency: string;
  assigned_head_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export function businessDate(input: RequestInput): string {
  return input.kind === 'leave' || input.kind === 'trip'
    ? input.start
    : input.kind === 'expense'
      ? input.lines.map((line) => line.date).sort()[0]!
      : input.date;
}

export function evidenceIds(input: RequestInput): string[] {
  return input.kind === 'leave'
    ? input.documentIds
    : input.kind === 'expense'
      ? [...new Set(input.lines.flatMap((line) => line.documentIds))]
      : [];
}

export function requireOwnEditable(actor: Actor, request: RequestRecord): void {
  invariant(actor.active && request.employee_id === actor.id, 'NOT_FOUND', 'ไม่พบรายการ', 404);
  invariant(
    ['draft', 'returned'].includes(request.workflow_state) &&
      !['allocated', 'paid'].includes(request.payment_state),
    'REQUEST_NOT_EDITABLE',
    'แก้ไขได้เฉพาะร่างหรือรายการที่ถูกส่งกลับ',
    409,
  );
}

export function canViewRequest(
  actor: Actor,
  request: Pick<RequestRecord, 'employee_id' | 'assigned_head_id' | 'kind'>,
): boolean {
  if (!actor.active) return false;
  if (
    actor.id === request.employee_id ||
    (actor.roles.includes('head') && actor.id === request.assigned_head_id)
  )
    return true;
  // System administration does not automatically grant access to private leave/medical information.
  return (
    actor.roles.includes('finance') && ['expense', 'advance', 'trip', 'ot'].includes(request.kind)
  );
}

export function managerialRouting(actor: Actor, headId: string | null) {
  if (actor.isHeadOwner)
    return { state: 'approved' as const, assignedHeadId: null, action: 'system_skipped' as const };
  invariant(
    headId && headId !== actor.id,
    'HEAD_NOT_CONFIGURED',
    'ยังไม่ได้กำหนดหัวหน้าตามสายงาน กรุณาติดต่อผู้ดูแล',
  );
  return { state: 'pending_head' as const, assignedHeadId: headId, action: 'submitted' as const };
}

export function requireHeadDecision(actor: Actor, request: RequestRecord): void {
  invariant(
    actor.active &&
      actor.roles.includes('head') &&
      request.assigned_head_id === actor.id &&
      request.employee_id !== actor.id,
    'FORBIDDEN',
    'คุณไม่ใช่หัวหน้าที่ได้รับมอบหมายสำหรับรายการนี้',
    403,
  );
  invariant(
    request.workflow_state === 'pending_head',
    'REQUEST_NOT_PENDING',
    'รายการนี้ไม่ได้รอการอนุมัติแล้ว',
    409,
  );
}

export const commandSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    action: z.enum([
      'submit',
      'approve',
      'return',
      'reject',
      'cancel',
      'finance_verify',
      'finance_return',
    ]),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();
