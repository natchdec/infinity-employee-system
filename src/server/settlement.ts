import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bangkokDate } from '../domain/calendar';
import { calculateSettlement } from '../domain/calculations';
import {
  invariant,
  requireIndependentFinance,
  requireRevision,
  requireRole,
  type Actor,
  type Json,
} from '../domain/core';
import { audit, command, enqueue, safeJson } from './db';

const verifySchema = z.object({ expectedRevision: z.number().int().min(1) }).strict();
const refundSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    externalReference: z.string().trim().min(1).max(200),
  })
  .strict();

export interface SettlementResult {
  id: string;
  tripId: string;
  revision: number;
  state: 'submitted' | 'refund_due' | 'top_up_due' | 'settled' | 'returned' | 'void';
  actualSatang: string;
  paidAdvanceSatang: string;
  netSatang: string;
  dueDate: string;
}

function result(row: Record<string, unknown>): SettlementResult {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    revision: Number(row.revision),
    state: row.state as SettlementResult['state'],
    actualSatang: String(row.actual_satang),
    paidAdvanceSatang: String(row.paid_advance_satang),
    netSatang: String(row.net_satang),
    dueDate: String(row.due_date),
  };
}

export async function submitSettlement(
  actor: Actor,
  tripId: string,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<SettlementResult> {
  return command(actor, `settlement.submit:${tripId}`, idempotencyKey, { tripId }, async (tx) => {
    const [trip] = await tx`
      select r.id,r.employee_id,r.workflow_state,r.submission_round,t.per_diem_satang::text,t.end_date::text,t.due_date::text
      from requests r
      join trip_details t on t.request_id=r.id and t.round=r.submission_round
      where r.id=${tripId} and r.kind='trip'
      for update of r
    `;
    invariant(trip && trip.employee_id === actor.id, 'NOT_FOUND', 'ไม่พบทริปของคุณ', 404);
    invariant(
      trip.workflow_state === 'approved',
      'TRIP_NOT_APPROVED',
      'ทริปต้องได้รับอนุมัติก่อนเคลียร์ค่าใช้จ่าย',
      409,
    );
    invariant(
      bangkokDate(now) >= trip.end_date,
      'TRIP_NOT_ENDED',
      'เริ่มเคลียร์ค่าใช้จ่ายได้เมื่อทริปสิ้นสุดแล้ว',
      409,
    );
    const active = await tx`
      select id from settlements where trip_id=${tripId} and state not in ('returned','void') limit 1
    `;
    invariant(
      !active.length,
      'SETTLEMENT_ALREADY_ACTIVE',
      'ทริปนี้มีการเคลียร์ค่าใช้จ่ายที่กำลังดำเนินการแล้ว',
      409,
    );

    const expenses = await tx`
      select id,submission_round,total_satang::text
      from requests
      where parent_trip_id=${tripId}
        and kind='expense'
        and workflow_state='approved'
        and finance_state='verified'
      order by id
      for update
    `;
    const advances = await tx`
      select id,submission_round,total_satang::text
      from requests
      where parent_trip_id=${tripId}
        and kind='advance'
        and workflow_state='approved'
        and finance_state='verified'
        and payment_state='paid'
      order by id
      for update
    `;
    const expenseTotal = expenses.reduce((sum, row) => sum + BigInt(row.total_satang), 0n);
    const perDiem = BigInt(trip.per_diem_satang);
    const actual = expenseTotal + perDiem;
    const paidAdvance = advances.reduce((sum, row) => sum + BigInt(row.total_satang), 0n);
    const calc = calculateSettlement(actual.toString(), paidAdvance.toString());
    const id = randomUUID();

    const [inserted] = await tx`
      insert into settlements(
        id,trip_id,owner_id,revision,state,actual_satang,paid_advance_satang,net_satang,input_snapshot,due_date
      )
      values(
        ${id},${tripId},${actor.id},1,'submitted',${actual.toString()},${paidAdvance.toString()},
        ${calc.netSatang},
        ${tx.json(
          safeJson({
            tripRound: trip.submission_round,
            perDiemSatang: trip.per_diem_satang,
            expenseIds: expenses.map((row) => row.id),
            advanceIds: advances.map((row) => row.id),
            calculatedAt: now.toISOString(),
          }),
        )},
        ${trip.due_date}
      )
      returning *
    `;
    if (perDiem > 0n) {
      await tx`
        insert into settlement_allocations(settlement_id,request_id,round,kind,amount_satang)
        values(${id},${tripId},${trip.submission_round},'per_diem',${perDiem.toString()})
      `;
    }
    for (const expense of expenses) {
      await tx`
        insert into settlement_allocations(settlement_id,request_id,round,kind,amount_satang)
        values(${id},${expense.id},${expense.submission_round},'actual',${expense.total_satang})
      `;
    }
    for (const advance of advances) {
      await tx`
        insert into settlement_allocations(settlement_id,request_id,round,kind,amount_satang)
        values(${id},${advance.id},${advance.submission_round},'advance',${advance.total_satang})
      `;
    }
    await audit(
      tx,
      actor,
      'settlement.submitted',
      'settlement',
      id,
      1,
      safeJson(calc),
      correlationId,
    );
    return result(inserted as Record<string, unknown>) as unknown as Json;
  }) as unknown as Promise<SettlementResult>;
}

export async function verifySettlement(
  actor: Actor,
  settlementId: string,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<SettlementResult> {
  requireRole(actor, 'finance');
  const input = verifySchema.parse(rawInput);
  return command(
    actor,
    `settlement.verify:${settlementId}`,
    idempotencyKey,
    { settlementId, ...input },
    async (tx) => {
      const [row] = await tx`select * from settlements where id=${settlementId} for update`;
      invariant(row, 'SETTLEMENT_NOT_FOUND', 'ไม่พบรายการเคลียร์ค่าใช้จ่าย', 404);
      requireRevision(row.revision, input.expectedRevision);
      requireIndependentFinance(actor, row.owner_id);
      invariant(
        row.state === 'submitted',
        'SETTLEMENT_NOT_PENDING',
        'รายการนี้ไม่ได้รอตรวจสอบแล้ว',
        409,
      );

      const net = BigInt(row.net_satang);
      const nextState: SettlementResult['state'] =
        net > 0n ? 'top_up_due' : net < 0n ? 'refund_due' : 'settled';
      const revision = row.revision + 1;
      await tx`
      update settlements
      set state=${nextState},revision=${revision},verified_by=${actor.id},verified_at=${now}
      where id=${settlementId}
    `;
      if (net > 0n) {
        await tx`
        insert into payable_obligations(
          owner_id,source_kind,source_id,source_round,request_id,amount_satang,currency,verified_by,state,snapshot
        )
        values(
          ${row.owner_id},'settlement',${settlementId},${revision},null,${net.toString()},'THB',${actor.id},'unpaid',
          ${tx.json(
            safeJson({
              settlementId,
              tripId: row.trip_id,
              actualSatang: String(row.actual_satang),
              paidAdvanceSatang: String(row.paid_advance_satang),
              netSatang: String(row.net_satang),
              verifiedAt: now.toISOString(),
            }),
          )}
        )
      `;
      }
      await audit(
        tx,
        actor,
        'settlement.verified',
        'settlement',
        settlementId,
        revision,
        safeJson({ state: nextState, netSatang: String(row.net_satang) }),
        correlationId,
      );
      await enqueue(tx, 'in_app_notification', `${settlementId}:verified:${revision}`, {
        employeeId: row.owner_id,
        title:
          nextState === 'top_up_due'
            ? 'บริษัทมีส่วนต่างต้องจ่ายเพิ่ม'
            : nextState === 'refund_due'
              ? 'มีเงินทดรองส่วนเกินที่ต้องคืน'
              : 'เคลียร์ค่าใช้จ่ายเรียบร้อย',
        href: `/trips/${row.trip_id}`,
      });
      return result({ ...row, revision, state: nextState }) as unknown as Json;
    },
  ) as unknown as Promise<SettlementResult>;
}

export async function confirmSettlementRefund(
  actor: Actor,
  settlementId: string,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<SettlementResult> {
  requireRole(actor, 'finance');
  const input = refundSchema.parse(rawInput);
  return command(
    actor,
    `settlement.refund:${settlementId}`,
    idempotencyKey,
    { settlementId, ...input },
    async (tx) => {
      const [row] = await tx`select * from settlements where id=${settlementId} for update`;
      invariant(row, 'SETTLEMENT_NOT_FOUND', 'ไม่พบรายการเคลียร์ค่าใช้จ่าย', 404);
      requireRevision(row.revision, input.expectedRevision);
      requireIndependentFinance(actor, row.owner_id);
      invariant(
        row.state === 'refund_due',
        'REFUND_NOT_DUE',
        'รายการนี้ไม่มีเงินทดรองส่วนเกินที่รอรับคืน',
        409,
      );
      const revision = row.revision + 1;
      await tx`
      update settlements
      set state='settled',revision=${revision},
          refund_reference=${input.externalReference},
          refund_confirmed_by=${actor.id},
          refund_confirmed_at=${now}
      where id=${settlementId}
    `;
      await audit(
        tx,
        actor,
        'settlement.refund_confirmed',
        'settlement',
        settlementId,
        revision,
        safeJson({ externalReference: input.externalReference }),
        correlationId,
      );
      await enqueue(tx, 'in_app_notification', `${settlementId}:refund:${revision}`, {
        employeeId: row.owner_id,
        title: 'บันทึกรับเงินคืนและปิดการเคลียร์ค่าใช้จ่ายแล้ว',
        href: `/trips/${row.trip_id}`,
      });
      return result({ ...row, revision, state: 'settled' }) as unknown as Json;
    },
  ) as unknown as Promise<SettlementResult>;
}
