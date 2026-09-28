import { invariant, money, type Actor, type Json } from '../domain/core';
import {
  addDays,
  bangkokDate,
  weekday,
  settlementDueDate,
  type Calendar,
} from '../domain/calendar';
import {
  calculateOT,
  calculateLeave,
  calculatePerDiem,
  type WageBasis,
} from '../domain/calculations';
import { requestInputSchema, businessDate, type RequestInput } from '../domain/requests';
import type { LeavePolicy, OTPolicy, PerDiemPolicy, VersionedPolicy } from '../domain/policy';
import { policyFor, safeJson, type Transaction } from './db';
import { prepareExpense, validateDocuments } from './prepare-expense';
import { config } from './config';

export interface PreparedRequest {
  input: RequestInput;
  date: string;
  calculation: Record<string, Json>;
  totalSatang: string;
  policies: VersionedPolicy[];
  project: Json;
  wage: Json;
  headId: string | null;
  originalRequired: boolean;
}
export async function prepareRequest(
  tx: Transaction,
  actor: Actor,
  raw: unknown,
  requestId: string,
  now: Date,
): Promise<PreparedRequest> {
  const input = requestInputSchema.parse(raw);
  const date = businessDate(input);
  const policies: VersionedPolicy[] = [await policyFor(tx, 'approval', bangkokDate(now))];
  let project: Json = null;
  let wage: Json = null;
  let originalRequired = false;
  let calculation: Record<string, Json> = {};
  let totalSatang = '0';
  const parentId = input.kind === 'expense' || input.kind === 'advance' ? input.parentTripId : null;
  if (parentId) {
    const [parent] =
      await tx`select id,employee_id,kind,workflow_state,project_reference_id from requests where id=${parentId} for update`;
    invariant(
      parent &&
        parent.kind === 'trip' &&
        parent.employee_id === actor.id &&
        parent.workflow_state === 'approved',
      'TRIP_NOT_ELIGIBLE',
      'ต้องอ้างอิงการเดินทางของคุณที่ได้รับอนุมัติแล้ว',
    );
    const frozen =
      await tx`select id from settlements where trip_id=${parentId} and state not in ('returned','void') limit 1`;
    invariant(
      !frozen.length,
      'TRIP_SETTLEMENT_FROZEN',
      'ทริปนี้เริ่มเคลียร์ค่าใช้จ่ายแล้ว ต้องใช้กระบวนการแก้ไขที่ตรวจสอบได้',
      409,
    );
    if (!input.projectId) input.projectId = parent.project_reference_id;
    invariant(
      input.projectId === parent.project_reference_id,
      'TRIP_PROJECT_MISMATCH',
      'โครงการต้องตรงกับทริปหลัก',
    );
  }
  if (input.kind === 'trip')
    invariant(input.projectId, 'TRIP_PROJECT_REQUIRED', 'เลือกโครงการสำหรับการเดินทาง');
  if (input.projectId) {
    const [row] =
      await tx`select id,source,code,name,customer,status,cost_center,last_synced_at from project_references where id=${input.projectId}`;
    invariant(
      row && row.status === 'active',
      'PROJECT_NOT_AVAILABLE',
      'โครงการไม่เปิดใช้งานหรือยังไม่ได้ซิงก์',
    );
    invariant(
      config().APP_ENV !== 'production' || row.source === 'microsoft_lists',
      'SYNTHETIC_PROJECT_FORBIDDEN',
      'ข้อมูลโครงการทดสอบใช้ใน production ไม่ได้',
    );
    project = safeJson(row);
  }
  let headId: string | null = null;
  if (!actor.isHeadOwner) {
    const heads =
      await tx`select rl.head_id from reporting_lines rl join employees e on e.id=rl.head_id where rl.employee_id=${actor.id} and rl.effective_from<=${bangkokDate(now)}::date and (rl.effective_to is null or rl.effective_to>${bangkokDate(now)}::date) and e.active and exists(select 1 from employee_roles er where er.employee_id=e.id and er.role='head')`;
    invariant(
      heads.length === 1 && heads[0]!.head_id !== actor.id,
      'HEAD_NOT_CONFIGURED',
      'ต้องมีหัวหน้าตามสายงานที่เปิดใช้งานเพียงหนึ่งคน',
    );
    headId = heads[0]!.head_id;
  }
  if (input.kind === 'leave') {
    const policy = await policyFor<LeavePolicy>(tx, 'leave', date);
    const calendar = await policyFor<Calendar>(tx, 'calendar', date);
    const endPolicy = await policyFor(tx, 'leave', input.end);
    const endCalendar = await policyFor(tx, 'calendar', input.end);
    invariant(
      policy.id === endPolicy.id && calendar.id === endCalendar.id,
      'LEAVE_SPLIT_POLICY',
      'กรุณาแยกคำขอเมื่อช่วงวันลาข้ามเวอร์ชันนโยบายหรือปฏิทิน',
    );
    policies.push(policy, calendar);
    const [employee] = await tx`select hire_date::text from employees where id=${actor.id}`;
    invariant(
      employee?.hire_date,
      'HIRE_DATE_REQUIRED',
      'ยังไม่มีวันเริ่มงานที่ยืนยันแล้ว กรุณาให้ HR/Admin อัปเดตก่อนยื่นคำขอลา',
      409,
    );
    const type = policy.body.types.find((item) => item.id === input.typeId);
    invariant(type, 'LEAVE_TYPE_NOT_ENABLED', 'ประเภทลาไม่เปิดใช้งาน');
    const period = type.period === 'year' ? date.slice(0, 4) : (input.eventReference ?? '');
    const [used] =
      await tx`select coalesce(sum(days),0)::integer as days,coalesce(sum(paid_days),0)::integer as paid_days from leave_bookings where employee_id=${actor.id} and type_id=${input.typeId} and period=${period} and state in ('held','approved') and request_id<>${requestId}`;
    const result = calculateLeave(
      input,
      policy.body,
      calendar.body,
      employee!.hire_date,
      used!.days,
      used!.paid_days,
      input.eventReference,
    );
    invariant(
      !result.evidenceRequired || input.documentIds.length > 0,
      'LEAVE_EVIDENCE_REQUIRED',
      'ประเภทลานี้ต้องแนบหลักฐาน',
    );
    await validateDocuments(tx, actor, input.documentIds, requestId, 'medical');
    calculation = safeJson(result) as Record<string, Json>;
  } else if (input.kind === 'ot') {
    invariant(input.date <= bangkokDate(now), 'FUTURE_OT_DATE', 'บันทึก OT จริงล่วงหน้าไม่ได้');
    const policy = await policyFor<OTPolicy>(tx, 'ot', date);
    const calendar = await policyFor<Calendar>(tx, 'calendar', date);
    policies.push(policy, calendar);
    const [basis] =
      await tx`select id,monthly_satang::text,normal_daily_hours,ot_eligibility,effective_from::text from wage_versions where employee_id=${actor.id} and effective_from<=${date}::date order by effective_from desc limit 1`;
    invariant(basis, 'WAGE_REQUIRED', 'ยังไม่มีฐานค่าจ้างที่มีผลสำหรับวันที่ทำ OT');
    const wageBasis: WageBasis = {
      monthlySatang: basis.monthly_satang,
      normalDailyHours: basis.normal_daily_hours,
      eligibility: basis.ot_eligibility,
    };
    const result = calculateOT(date, input.lines, wageBasis, policy.body, calendar.body);
    const start = addDays(date, -(weekday(date) === 0 ? 6 : weekday(date) - 1));
    const [existing] =
      await tx`select coalesce(sum(l.hours),0)::double precision as weekly,coalesce(sum(case when l.work_date=${date}::date then l.hours else 0 end),0)::double precision as daily from ot_lines l join requests r on r.id=l.request_id and r.submission_round=l.round where r.employee_id=${actor.id} and r.id<>${requestId} and r.workflow_state in ('pending_head','approved') and l.work_date between ${start}::date and ${addDays(start, 6)}::date`;
    invariant(
      Number(existing!.daily) + result.totalHours <= policy.body.maxDailyHours,
      'OT_DAILY_LIMIT',
      'ชั่วโมง OT รวมทุกคำขอเกินเพดานต่อวัน',
    );
    invariant(
      Number(existing!.weekly) + result.totalHours <= policy.body.maxWeeklyHours,
      'OT_WEEKLY_LIMIT',
      'ชั่วโมง OT และงานวันหยุดรวมเกินเพดานต่อสัปดาห์',
    );
    wage = safeJson(basis);
    calculation = safeJson(result) as Record<string, Json>;
    totalSatang = result.totalSatang;
  } else if (input.kind === 'expense') {
    const result = await prepareExpense(tx, actor, input, requestId, now);
    calculation = result.calculation;
    totalSatang = result.totalSatang;
    policies.push(...result.snapshots);
    originalRequired = result.originalRequired;
  } else if (input.kind === 'trip') {
    const policy = await policyFor<PerDiemPolicy>(tx, 'per_diem', date);
    policies.push(policy);
    const perDiem = calculatePerDiem(
      input.start,
      input.end,
      input.region,
      input.requestPerDiem,
      policy.body,
    );
    const estimatedOther = money(input.estimatedAmount);
    totalSatang = (estimatedOther + BigInt(perDiem.totalSatang)).toString();
    calculation = {
      perDiem: safeJson(perDiem),
      estimatedOtherSatang: estimatedOther.toString(),
      totalEstimateSatang: totalSatang,
      dueDate: settlementDueDate(input.end, policy.body.settlementDueDays),
    };
  } else {
    totalSatang = money(input.amount).toString();
    invariant(BigInt(totalSatang) > 0n, 'POSITIVE_ADVANCE_REQUIRED', 'เงินทดรองต้องมากกว่าศูนย์');
    calculation = { totalSatang, parentTripId: input.parentTripId };
  }
  invariant(BigInt(totalSatang) <= 99999999999n, 'MONEY_LIMIT', 'ยอดรวมเกินขอบเขตที่ระบบรองรับ');
  return {
    input,
    date,
    calculation,
    totalSatang,
    policies,
    project,
    wage,
    headId,
    originalRequired,
  };
}
