import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  invariant,
  requireIndependentFinance,
  requireIndependentPayer,
  requireRevision,
  requireRole,
  type Actor,
  type Json,
} from '../domain/core';
import { bangkokDate } from '../domain/calendar';
import { audit, command, safeJson } from './db';
import { enqueueEmployeeNotice } from './notification-queue';

const createBatchSchema = z
  .object({
    method: z.enum(['petty_cash', 'transfer']),
    obligationIds: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict();

const payBatchSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    paidDate: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-[0-3]\d$/),
    externalReference: z.string().trim().min(1).max(200),
  })
  .strict();

export interface PaymentBatchResult {
  id: string;
  reference: string;
  status: 'ready' | 'paid' | 'void';
  revision: number;
  totalSatang: string;
  itemCount: number;
  method: 'petty_cash' | 'transfer';
}

export async function createPaymentBatch(
  actor: Actor,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<PaymentBatchResult> {
  requireRole(actor, 'finance');
  const input = createBatchSchema.parse(rawInput);
  const uniqueIds = [...new Set(input.obligationIds)];
  invariant(
    uniqueIds.length === input.obligationIds.length,
    'DUPLICATE_PAYMENT_ITEM',
    'มีรายการจ่ายซ้ำในชุดเดียวกัน',
  );

  return command(actor, 'payment.batch.create', idempotencyKey, input, async (tx) => {
    await tx`select pg_advisory_xact_lock(1709232040)`;
    const rows = await tx`
      select id,owner_id,source_kind,source_id,request_id,amount_satang::text,currency,state
      from payable_obligations
      where id in ${tx(uniqueIds)}
      for update
    `;
    invariant(
      rows.length === uniqueIds.length,
      'PAYABLE_NOT_FOUND',
      'มีรายการพร้อมจ่ายที่ไม่พบหรือถูกเปลี่ยนแปลง',
      409,
    );
    for (const row of rows) {
      invariant(
        row.state === 'unpaid',
        'PAYABLE_NOT_AVAILABLE',
        'รายการถูกจัดชุดหรือจ่ายแล้ว',
        409,
      );
      requireIndependentFinance(actor, row.owner_id);
      invariant(
        row.currency === 'THB',
        'PAYMENT_CURRENCY_UNSUPPORTED',
        'ชุดจ่าย V1 รองรับ THB เท่านั้น',
      );
    }
    const total = rows.reduce((sum, row) => sum + BigInt(row.amount_satang), 0n);
    invariant(total > 0n, 'EMPTY_PAYMENT_BATCH', 'ชุดจ่ายต้องมียอดมากกว่าศูนย์');
    const id = randomUUID();
    const reference = `PAY-${bangkokDate(now).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`;

    await tx`
      insert into payment_batches(id,reference,method,status,total_satang,revision,prepared_by)
      values(${id},${reference},${input.method},'ready',${total.toString()},1,${actor.id})
    `;
    for (const row of rows) {
      await tx`
        insert into payment_items(batch_id,obligation_id,amount_satang)
        values(${id},${row.id},${row.amount_satang})
      `;
      await tx`update payable_obligations set state='allocated' where id=${row.id}`;
      if (row.request_id) {
        await tx`
          update requests
          set payment_state='allocated', updated_at=${now}
          where id=${row.request_id} and payment_state='unpaid'
        `;
      }
    }
    await audit(
      tx,
      actor,
      'payment.batch_created',
      'payment_batch',
      id,
      1,
      safeJson({
        reference,
        method: input.method,
        obligationIds: uniqueIds,
        totalSatang: total.toString(),
      }),
      correlationId,
    );
    return {
      id,
      reference,
      status: 'ready',
      revision: 1,
      totalSatang: total.toString(),
      itemCount: rows.length,
      method: input.method,
    } satisfies PaymentBatchResult as unknown as Json;
  }) as unknown as Promise<PaymentBatchResult>;
}

export async function markPaymentBatchPaid(
  actor: Actor,
  batchId: string,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<PaymentBatchResult> {
  requireRole(actor, 'finance_payer');
  const input = payBatchSchema.parse(rawInput);

  return command(
    actor,
    `payment.batch.pay:${batchId}`,
    idempotencyKey,
    { batchId, ...input },
    async (tx) => {
      const [batch] = await tx`
      select id,reference,method,status,total_satang::text,revision
      from payment_batches
      where id=${batchId}
      for update
    `;
      invariant(batch, 'PAYMENT_BATCH_NOT_FOUND', 'ไม่พบชุดจ่าย', 404);
      requireRevision(batch.revision, input.expectedRevision);
      invariant(
        batch.status === 'ready',
        'PAYMENT_BATCH_NOT_READY',
        'ชุดจ่ายนี้ไม่พร้อมบันทึกการจ่าย',
        409,
      );

      const obligations = await tx`
      select o.id,o.owner_id,o.request_id,o.source_kind,o.source_id,o.state,o.amount_satang::text,o.verified_by
      from payment_items i
      join payable_obligations o on o.id=i.obligation_id
      where i.batch_id=${batchId} and i.active
      for update of o
    `;
      invariant(obligations.length > 0, 'EMPTY_PAYMENT_BATCH', 'ไม่พบรายการในชุดจ่าย', 409);
      for (const item of obligations) {
        requireIndependentPayer(actor, item.owner_id, String(item.verified_by));
        invariant(
          item.state === 'allocated',
          'PAYABLE_NOT_ALLOCATED',
          'รายการในชุดจ่ายมีสถานะไม่ถูกต้อง',
          409,
        );
      }

      const revision = batch.revision + 1;
      await tx`
      update payment_batches
      set status='paid',
          revision=${revision},
          paid_by=${actor.id},
          paid_at=${now},
          paid_date=${input.paidDate},
          external_reference=${input.externalReference}
      where id=${batchId}
    `;
      for (const item of obligations) {
        await tx`update payable_obligations set state='paid',paid_at=${now} where id=${item.id}`;
        if (item.request_id) {
          await tx`
          update requests
          set payment_state='paid',updated_at=${now}
          where id=${item.request_id} and payment_state='allocated'
        `;
        }
        if (item.source_kind === 'settlement') {
          await tx`
          update settlements
          set state='settled',revision=revision+1
          where id=${item.source_id} and state='top_up_due'
        `;
        }
        await enqueueEmployeeNotice(tx, `${batchId}:${item.id}:paid`, {
          employeeId: item.owner_id,
          title: 'บันทึกการจ่ายเงินแล้ว',
          detail: `Payment Batch ${batch.reference} ถูกยืนยัน Paid แล้ว`,
          href: item.request_id ? `/requests/${item.request_id}` : '/trips',
        });
      }
      await audit(
        tx,
        actor,
        'payment.batch_paid',
        'payment_batch',
        batchId,
        revision,
        safeJson({
          reference: batch.reference,
          paidDate: input.paidDate,
          externalReference: input.externalReference,
          obligationIds: obligations.map((item) => item.id),
        }),
        correlationId,
      );
      return {
        id: batch.id,
        reference: batch.reference,
        status: 'paid',
        revision,
        totalSatang: batch.total_satang,
        itemCount: obligations.length,
        method: batch.method,
      } satisfies PaymentBatchResult as unknown as Json;
    },
  ) as unknown as Promise<PaymentBatchResult>;
}

export async function voidPaymentBatch(
  actor: Actor,
  batchId: string,
  expectedRevision: number,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<PaymentBatchResult> {
  requireRole(actor, 'finance');
  return command(
    actor,
    `payment.batch.void:${batchId}`,
    idempotencyKey,
    { batchId, expectedRevision },
    async (tx) => {
      const [batch] = await tx`
      select id,reference,method,status,total_satang::text,revision
      from payment_batches where id=${batchId} for update
    `;
      invariant(batch, 'PAYMENT_BATCH_NOT_FOUND', 'ไม่พบชุดจ่าย', 404);
      requireRevision(batch.revision, expectedRevision);
      invariant(
        batch.status === 'ready',
        'PAYMENT_BATCH_NOT_VOIDABLE',
        'ยกเลิกได้เฉพาะชุดจ่ายที่ยังไม่จ่าย',
        409,
      );
      const items = await tx`
      select o.id,o.request_id,o.state
      from payment_items i join payable_obligations o on o.id=i.obligation_id
      where i.batch_id=${batchId} and i.active
      for update of o
    `;
      for (const item of items) {
        invariant(
          item.state === 'allocated',
          'PAYABLE_NOT_ALLOCATED',
          'สถานะรายการจ่ายไม่ถูกต้อง',
          409,
        );
        await tx`update payable_obligations set state='unpaid' where id=${item.id}`;
        await tx`update payment_items set active=false where batch_id=${batchId} and obligation_id=${item.id}`;
        if (item.request_id) {
          await tx`update requests set payment_state='unpaid',updated_at=${now} where id=${item.request_id} and payment_state='allocated'`;
        }
      }
      const revision = batch.revision + 1;
      await tx`update payment_batches set status='void',revision=${revision} where id=${batchId}`;
      await audit(
        tx,
        actor,
        'payment.batch_voided',
        'payment_batch',
        batchId,
        revision,
        {},
        correlationId,
      );
      return {
        id: batch.id,
        reference: batch.reference,
        status: 'void',
        revision,
        totalSatang: batch.total_satang,
        itemCount: items.length,
        method: batch.method,
      } satisfies PaymentBatchResult as unknown as Json;
    },
  ) as unknown as Promise<PaymentBatchResult>;
}
