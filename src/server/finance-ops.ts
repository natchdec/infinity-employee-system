import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  invariant,
  requireIndependentFinance,
  requireRevision,
  requireRole,
  type Actor,
  type Json,
} from '../domain/core';
import { audit, command, safeJson } from './db';

const receiptSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export interface OriginalReceiptResult {
  requestId: string;
  state: 'not_required' | 'outstanding' | 'received';
  revision: number;
  receivedAt: string | null;
}

export async function markOriginalReceiptReceived(
  actor: Actor,
  requestId: string,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<OriginalReceiptResult> {
  requireRole(actor, 'finance');
  const input = receiptSchema.parse(rawInput);
  return command(
    actor,
    `receipt.original.receive:${requestId}`,
    idempotencyKey,
    { requestId, ...input },
    async (tx) => {
      const [row] = await tx`
        select o.request_id,o.state,o.revision,r.employee_id
        from original_receipts o
        join requests r on r.id=o.request_id
        where o.request_id=${requestId}
        for update of o
      `;
      invariant(row, 'ORIGINAL_RECEIPT_NOT_FOUND', 'ไม่พบสถานะใบเสร็จต้นฉบับ', 404);
      requireIndependentFinance(actor, row.employee_id);
      requireRevision(row.revision, input.expectedRevision);
      invariant(
        row.state === 'outstanding',
        'ORIGINAL_RECEIPT_NOT_OUTSTANDING',
        'รายการนี้ไม่ได้รอใบเสร็จต้นฉบับ',
        409,
      );
      const revision = row.revision + 1;
      await tx`
        update original_receipts
        set state='received',
            received_by=${actor.id},
            received_at=${now},
            note=${input.note ?? null},
            revision=${revision}
        where request_id=${requestId}
      `;
      await audit(
        tx,
        actor,
        'receipt.original_received',
        'request',
        requestId,
        revision,
        safeJson({ note: input.note ?? null }),
        correlationId,
      );
      return {
        requestId,
        state: 'received',
        revision,
        receivedAt: now.toISOString(),
      } satisfies OriginalReceiptResult as unknown as Json;
    },
  ) as unknown as Promise<OriginalReceiptResult>;
}
