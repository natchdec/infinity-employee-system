import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { csv, fingerprint, invariant, requireRole, type Actor, type Json } from '../domain/core';
import { audit, command, safeJson } from './db';

const payrollSchema = z
  .object({
    month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
    adapter: z.enum(['neutral_review_csv', 'easy_acc']),
  })
  .strict();

const accountingSchema = z
  .object({
    from: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
    to: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
    adapter: z.enum(['neutral_review_csv', 'smartbiz']),
  })
  .strict();

export interface ExportResult {
  id: string;
  adapter: 'neutral_review_csv' | 'easy_acc' | 'smartbiz';
  scope: string;
  state: 'completed' | 'blocked' | 'failed';
  artifactContent: string | null;
  artifactSha256: string | null;
  blockedReason: string | null;
}

export async function createPayrollExport(
  actor: Actor,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<ExportResult> {
  requireRole(actor, 'finance');
  const input = payrollSchema.parse(rawInput);
  return command(
    actor,
    `export.payroll:${input.month}:${input.adapter}`,
    idempotencyKey,
    input,
    async (tx) => {
      const [cycle] =
        await tx`select month,payday::text,cutoff_at,state from payroll_cycles where month=${input.month} for update`;
      invariant(cycle, 'PAYROLL_CYCLE_NOT_FOUND', 'ไม่พบรอบเงินเดือน', 404);
      const items = await tx`
      select i.id,i.request_id,i.round,i.employee_id,e.email,e.display_name,i.amount_satang::text,i.approved_at,r.reference
      from payroll_items i
      join employees e on e.id=i.employee_id
      join requests r on r.id=i.request_id
      where i.cycle_month=${input.month} and i.state='queued'
      order by e.email,r.reference
    `;
      invariant(items.length > 0, 'PAYROLL_EMPTY', 'ไม่มี OT ที่พร้อมส่งออกในรอบนี้', 409);
      const snapshot = safeJson({
        month: input.month,
        payday: cycle.payday,
        items: items.map((item) => ({
          requestId: item.request_id,
          round: item.round,
          employeeId: item.employee_id,
          email: item.email,
          reference: item.reference,
          amountSatang: item.amount_satang,
        })),
      });
      const inputHash = fingerprint(snapshot);
      if (input.adapter === 'easy_acc') {
        const id = randomUUID();
        const reason = 'ยังไม่ได้ยืนยันรูปแบบนำเข้า Easy-ACC ที่รองรับจากผู้ผลิต/ระบบจริง';
        await tx`
        insert into export_jobs(id,actor_id,adapter,scope,input_hash,input_snapshot,state,blocked_reason)
        values(${id},${actor.id},'easy_acc',${input.month},${inputHash},${tx.json(snapshot)},'blocked',${reason})
        on conflict(adapter,scope,input_hash) do nothing
      `;
        const [row] =
          await tx`select id from export_jobs where adapter='easy_acc' and scope=${input.month} and input_hash=${inputHash}`;
        invariant(row, 'EXPORT_RECORD_MISSING', 'ไม่พบหลักฐานงานส่งออก', 500);
        return {
          id: row.id,
          adapter: 'easy_acc',
          scope: input.month,
          state: 'blocked',
          artifactContent: null,
          artifactSha256: null,
          blockedReason: reason,
        } satisfies ExportResult as unknown as Json;
      }
      const content = csv([
        ['Reference', 'Employee Email', 'Employee', 'Amount THB', 'Approved At'],
        ...items.map((item) => [
          item.reference,
          item.email,
          item.display_name,
          (BigInt(item.amount_satang) / 100n).toString() +
            '.' +
            (BigInt(item.amount_satang) % 100n).toString().padStart(2, '0'),
          new Date(item.approved_at).toISOString(),
        ]),
      ]);
      const sha = createHash('sha256').update(content).digest('hex');
      const id = randomUUID();
      await tx`
      insert into export_jobs(id,actor_id,adapter,scope,input_hash,input_snapshot,state,artifact_sha256,artifact_content)
      values(${id},${actor.id},'neutral_review_csv',${input.month},${inputHash},${tx.json(snapshot)},'completed',${sha},${content})
      on conflict(adapter,scope,input_hash) do nothing
    `;
      const [row] = await tx`
      select id,artifact_sha256,artifact_content
      from export_jobs
      where adapter='neutral_review_csv' and scope=${input.month} and input_hash=${inputHash}
    `;
      invariant(row, 'EXPORT_RECORD_MISSING', 'ไม่พบหลักฐานงานส่งออก', 500);
      await audit(
        tx,
        actor,
        'export.payroll_review_created',
        'payroll_cycle',
        input.month,
        null,
        safeJson({ exportId: row.id, inputHash, generatedAt: now.toISOString() }),
        correlationId,
      );
      return {
        id: row.id,
        adapter: 'neutral_review_csv',
        scope: input.month,
        state: 'completed',
        artifactContent: row.artifact_content,
        artifactSha256: row.artifact_sha256,
        blockedReason: null,
      } satisfies ExportResult as unknown as Json;
    },
  ) as unknown as Promise<ExportResult>;
}

export async function createAccountingExport(
  actor: Actor,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId = randomUUID(),
): Promise<ExportResult> {
  requireRole(actor, 'finance');
  const input = accountingSchema.parse(rawInput);
  invariant(input.from <= input.to, 'INVALID_PERIOD', 'ช่วงวันที่ส่งออกไม่ถูกต้อง');
  return command(
    actor,
    `export.accounting:${input.from}:${input.to}:${input.adapter}`,
    idempotencyKey,
    input,
    async (tx) => {
      const rows = await tx`
      select o.id,o.source_kind,o.source_id,o.amount_satang::text,o.paid_at,e.email,e.display_name,
             coalesce(r.reference,'SETTLEMENT-' || left(o.source_id::text,8)) as reference
      from payable_obligations o
      join employees e on e.id=o.owner_id
      left join requests r on r.id=o.request_id
      where o.state='paid'
        and (o.paid_at at time zone 'Asia/Bangkok')::date between ${input.from}::date and ${input.to}::date
      order by o.paid_at,o.id
    `;
      invariant(rows.length > 0, 'ACCOUNTING_EMPTY', 'ไม่มีรายการจ่ายในช่วงวันที่นี้', 409);
      const snapshot = safeJson({
        from: input.from,
        to: input.to,
        rows: rows.map((row) => ({
          id: row.id,
          reference: row.reference,
          sourceKind: row.source_kind,
          amountSatang: row.amount_satang,
          paidAt: new Date(row.paid_at).toISOString(),
        })),
      });
      const scope = `${input.from}..${input.to}`;
      const inputHash = fingerprint(snapshot);
      if (input.adapter === 'smartbiz') {
        const id = randomUUID();
        const reason = 'ยังไม่ได้ยืนยันรูปแบบนำเข้า Smartbiz ที่รองรับจากผู้ผลิต/ระบบจริง';
        await tx`
        insert into export_jobs(id,actor_id,adapter,scope,input_hash,input_snapshot,state,blocked_reason)
        values(${id},${actor.id},'smartbiz',${scope},${inputHash},${tx.json(snapshot)},'blocked',${reason})
        on conflict(adapter,scope,input_hash) do nothing
      `;
        const [row] =
          await tx`select id from export_jobs where adapter='smartbiz' and scope=${scope} and input_hash=${inputHash}`;
        invariant(row, 'EXPORT_RECORD_MISSING', 'ไม่พบหลักฐานงานส่งออก', 500);
        return {
          id: row.id,
          adapter: 'smartbiz',
          scope,
          state: 'blocked',
          artifactContent: null,
          artifactSha256: null,
          blockedReason: reason,
        } satisfies ExportResult as unknown as Json;
      }
      const content = csv([
        ['Reference', 'Employee Email', 'Employee', 'Source', 'Amount THB', 'Paid At'],
        ...rows.map((row) => [
          row.reference,
          row.email,
          row.display_name,
          row.source_kind,
          (BigInt(row.amount_satang) / 100n).toString() +
            '.' +
            (BigInt(row.amount_satang) % 100n).toString().padStart(2, '0'),
          new Date(row.paid_at).toISOString(),
        ]),
      ]);
      const sha = createHash('sha256').update(content).digest('hex');
      const id = randomUUID();
      await tx`
      insert into export_jobs(id,actor_id,adapter,scope,input_hash,input_snapshot,state,artifact_sha256,artifact_content)
      values(${id},${actor.id},'neutral_review_csv',${scope},${inputHash},${tx.json(snapshot)},'completed',${sha},${content})
      on conflict(adapter,scope,input_hash) do nothing
    `;
      const [row] = await tx`
      select id,artifact_sha256,artifact_content
      from export_jobs
      where adapter='neutral_review_csv' and scope=${scope} and input_hash=${inputHash}
    `;
      invariant(row, 'EXPORT_RECORD_MISSING', 'ไม่พบหลักฐานงานส่งออก', 500);
      await audit(
        tx,
        actor,
        'export.accounting_review_created',
        'accounting_period',
        scope,
        null,
        safeJson({ exportId: row.id, inputHash, generatedAt: now.toISOString() }),
        correlationId,
      );
      return {
        id: row.id,
        adapter: 'neutral_review_csv',
        scope,
        state: 'completed',
        artifactContent: row.artifact_content,
        artifactSha256: row.artifact_sha256,
        blockedReason: null,
      } satisfies ExportResult as unknown as Json;
    },
  ) as unknown as Promise<ExportResult>;
}
