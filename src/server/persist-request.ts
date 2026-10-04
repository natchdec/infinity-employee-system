import { fingerprint, type Json } from '../domain/core';
import { evidenceIds, type RequestRecord } from '../domain/requests';
import type { PreparedRequest } from './prepare-request';
import { safeJson, type Transaction } from './db';

export async function persistSubmission(
  tx: Transaction,
  request: RequestRecord,
  prepared: PreparedRequest,
  round: number,
  now: Date,
): Promise<void> {
  await tx`insert into request_revisions(
      request_id,round,payload,calculation,policy_snapshots,project_snapshot,wage_snapshot,
      assigned_head_id,assigned_final_approver_id,approval_route_version_id,input_hash,submitted_at
    )
    values(
      ${request.id},${round},${tx.json(safeJson(prepared.input))},${tx.json(prepared.calculation)},
      ${tx.json(safeJson(prepared.policies))},${tx.json(prepared.project)},${tx.json(prepared.wage)},
      ${prepared.headId},${prepared.finalApproverId},${prepared.approvalRouteVersionId},
      ${fingerprint({ input: prepared.input, calculation: prepared.calculation, policyHashes: prepared.policies.map((policy) => policy.hash), approvalRouteVersionId: prepared.approvalRouteVersionId })},
      ${now}
    )`;
  const input = prepared.input;
  const calculation = prepared.calculation;
  if (input.kind === 'leave') {
    await tx`insert into leave_bookings(request_id,round,employee_id,type_id,period,days,paid_days,state) values(${request.id},${round},${request.employee_id},${input.typeId},${String(calculation.period)},${Number(calculation.days)},${Number(calculation.paidDays)},'held')`;
    for (const date of calculation.dates as string[])
      await tx`insert into leave_reservations(request_id,round,employee_id,leave_date) values(${request.id},${round},${request.employee_id},${date})`;
  } else if (input.kind === 'ot') {
    const lines = calculation.lines as Record<string, Json>[];
    for (const [index, line] of lines.entries())
      await tx`insert into ot_lines(request_id,round,line,work_date,category_id,hours,multiplier_basis_points,amount_satang) values(${request.id},${round},${index + 1},${input.date},${String(line.categoryId)},${Number(line.hours)},${Number(line.multiplierBasisPoints)},${String(line.amountSatang)})`;
  } else if (input.kind === 'expense') {
    for (const line of calculation.lines as Record<string, Json>[]) {
      const expenseLine = Number(line.line);
      await tx`insert into expense_lines(request_id,round,line,category_id,expense_date,amount_satang,description,detail) values(${request.id},${round},${expenseLine},${String(line.categoryId)},${String(line.date)},${String(line.amountSatang)},${String(line.description)},${tx.json(line.detail!)})`;
      const documentIds = Array.isArray(line.documentIds)
        ? line.documentIds.filter((value): value is string => typeof value === 'string')
        : [];
      for (const documentId of documentIds)
        await tx`insert into document_links(document_id,request_id,round,expense_line) values(${documentId},${request.id},${round},${expenseLine})`;
    }
    await tx`insert into original_receipts(request_id,state) values(${request.id},${prepared.originalRequired ? 'outstanding' : 'not_required'}) on conflict(request_id) do update set state=excluded.state,received_by=null,received_at=null,note='Resubmission requires evidence recheck',revision=original_receipts.revision+1`;
  } else if (input.kind === 'trip') {
    const perDiem = calculation.perDiem as Record<string, Json>;
    await tx`insert into trip_details(request_id,round,start_date,end_date,destination,region,per_diem_satang,due_date,detail) values(${request.id},${round},${input.start},${input.end},${input.destination},${input.region},${String(perDiem.totalSatang)},${String(calculation.dueDate)},${tx.json(calculation)})`;
  }
  if (input.kind !== 'expense')
    for (const documentId of evidenceIds(input))
      await tx`insert into document_links(document_id,request_id,round) values(${documentId},${request.id},${round})`;
}

export async function releaseLeave(
  tx: Transaction,
  request: RequestRecord,
  reason: string,
): Promise<void> {
  if (request.kind !== 'leave') return;
  const [booking] =
    await tx`select * from leave_bookings where request_id=${request.id} and round=${request.submission_round} for update`;
  if (!booking || booking.state === 'cancelled') return;
  if (booking.state === 'approved')
    await tx`insert into leave_ledger(employee_id,type_id,period,units,request_id,round,event_key,reason) values(${request.employee_id},${booking.type_id},${booking.period},${booking.days},${request.id},${request.submission_round},${`${request.id}:${request.submission_round}:reversal`},${reason}) on conflict(event_key) do nothing`;
  await tx`update leave_bookings set state='cancelled' where request_id=${request.id} and round=${request.submission_round}`;
  await tx`update leave_reservations set active=false where request_id=${request.id} and round=${request.submission_round} and active`;
}
