import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { invariant, requireRevision, type Actor, type Json } from '../domain/core';
import { validateApprovalDelegation } from '../domain/monthly-operations';
import { audit, command, db } from './db';

const createSchema = z
  .object({
    action: z.literal('create'),
    delegateId: z.string().uuid(),
    effectiveFrom: z.string(),
    effectiveTo: z.string(),
  })
  .strict();

const disableSchema = z
  .object({
    action: z.literal('disable'),
    id: z.string().uuid(),
    expectedRevision: z.number().int().min(1),
  })
  .strict();

export interface ApprovalDelegationRow {
  id: string;
  delegateId: string;
  delegateName: string;
  effectiveFrom: string;
  effectiveTo: string;
  active: boolean;
  revision: number;
}

export async function approvalDelegationOptions(actor: Actor) {
  invariant(
    actor.active && actor.roles.includes('head'),
    'FORBIDDEN',
    'เฉพาะ Head ที่ตั้งผู้รับมอบหมายได้',
    403,
  );
  const [delegations, candidates] = await Promise.all([
    db()`
      select d.id,d.delegate_id,e.display_name,d.effective_from::text,d.effective_to::text,d.active,d.revision
      from approval_delegations d
      join employees e on e.id=d.delegate_id
      where d.delegator_id=${actor.id}
      order by d.active desc,d.effective_from desc,d.created_at desc
      limit 100
    `,
    db()`
      select e.id,e.display_name
      from employees e
      where e.active
        and e.id<>${actor.id}
        and exists(
          select 1 from employee_roles er
          where er.employee_id=e.id and er.role='head'
        )
      order by e.display_name,e.id
      limit 100
    `,
  ]);
  return {
    delegations: delegations.map((row) => ({
      id: String(row.id),
      delegateId: String(row.delegate_id),
      delegateName: String(row.display_name),
      effectiveFrom: String(row.effective_from),
      effectiveTo: String(row.effective_to),
      active: Boolean(row.active),
      revision: Number(row.revision),
    })) satisfies ApprovalDelegationRow[],
    candidates: candidates.map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
    })),
  };
}

export async function changeApprovalDelegation(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
) {
  invariant(
    actor.active && actor.roles.includes('head'),
    'FORBIDDEN',
    'เฉพาะ Head ที่ตั้งผู้รับมอบหมายได้',
    403,
  );
  const action = z
    .object({ action: z.enum(['create', 'disable']) })
    .passthrough()
    .parse(raw).action;

  if (action === 'create') {
    const input = createSchema.parse(raw);
    const value = validateApprovalDelegation({
      delegatorId: actor.id,
      delegateId: input.delegateId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    });
    return command(actor, 'approval-delegation.create', idempotencyKey, input, async (tx) => {
      const [delegate] = await tx`
        select e.id
        from employees e
        where e.id=${value.delegateId}
          and e.active
          and exists(
            select 1 from employee_roles er
            where er.employee_id=e.id and er.role='head'
          )
      `;
      invariant(
        delegate,
        'DELEGATE_NOT_AVAILABLE',
        'ผู้รับมอบหมายต้องเป็น Head ที่เปิดใช้งาน',
        409,
      );

      const overlap = await tx`
        select id
        from approval_delegations
        where delegator_id=${actor.id}
          and active
          and daterange(effective_from,effective_to,'[]') &&
              daterange(${value.effectiveFrom}::date,${value.effectiveTo}::date,'[]')
        limit 1
      `;
      invariant(
        overlap.length === 0,
        'DELEGATION_DATE_OVERLAP',
        'ช่วงวันที่นี้มีผู้รับมอบหมายที่เปิดใช้งานอยู่แล้ว',
        409,
      );

      const [created] = await tx`
        insert into approval_delegations(
          delegator_id,delegate_id,scope,effective_from,effective_to,active,revision,created_by,created_at
        )
        values(
          ${actor.id},${value.delegateId},'manager_approval',
          ${value.effectiveFrom}::date,${value.effectiveTo}::date,true,1,${actor.id},${now}
        )
        returning id,revision
      `;
      await audit(
        tx,
        actor,
        'approval_delegation.created',
        'approval_delegation',
        String(created!.id),
        Number(created!.revision),
        {
          delegateId: value.delegateId,
          effectiveFrom: value.effectiveFrom,
          effectiveTo: value.effectiveTo,
        },
        correlationId,
      );
      return {
        id: String(created!.id),
        revision: Number(created!.revision),
        active: true,
      } as Json;
    });
  }

  const input = disableSchema.parse(raw);
  return command(actor, 'approval-delegation.disable', idempotencyKey, input, async (tx) => {
    const [current] = await tx`
      select id,delegator_id,active,revision
      from approval_delegations
      where id=${input.id}
      for update
    `;
    invariant(current && current.delegator_id === actor.id, 'NOT_FOUND', 'ไม่พบการมอบหมาย', 404);
    requireRevision(Number(current.revision), input.expectedRevision);
    invariant(current.active, 'DELEGATION_ALREADY_DISABLED', 'การมอบหมายนี้ถูกปิดแล้ว', 409);
    const [updated] = await tx`
      update approval_delegations
      set active=false,revision=revision+1
      where id=${input.id}
      returning revision
    `;
    await audit(
      tx,
      actor,
      'approval_delegation.disabled',
      'approval_delegation',
      input.id,
      Number(updated!.revision),
      {},
      correlationId,
    );
    return {
      id: input.id,
      revision: Number(updated!.revision),
      active: false,
    } as Json;
  });
}
