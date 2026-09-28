import { invariant } from './core';
import { isoDate } from './calendar';

export type MonthlyPeriodState = 'open' | 'closing' | 'locked';
export type MonthlyPeriodFamily = 'payroll' | 'claims';

export function transitionMonthlyPeriod(
  current: MonthlyPeriodState,
  target: MonthlyPeriodState,
): MonthlyPeriodState {
  if (current === target) return current;
  const allowed =
    (current === 'open' && target === 'closing') ||
    (current === 'closing' && target === 'open') ||
    (current === 'closing' && target === 'locked');
  invariant(
    allowed,
    'MONTHLY_PERIOD_TRANSITION_INVALID',
    'สถานะรอบเดือนไม่สามารถเปลี่ยนตามลำดับที่ขอได้',
    409,
  );
  return target;
}

export interface ApprovalDelegationInput {
  delegatorId: string;
  delegateId: string;
  effectiveFrom: string;
  effectiveTo: string;
}

export function validateApprovalDelegation(
  input: ApprovalDelegationInput,
): ApprovalDelegationInput {
  invariant(
    input.delegatorId !== input.delegateId,
    'DELEGATION_SELF_FORBIDDEN',
    'ไม่สามารถมอบหมายสิทธิ์อนุมัติให้ตนเอง',
  );
  isoDate(input.effectiveFrom);
  isoDate(input.effectiveTo);
  invariant(
    input.effectiveTo >= input.effectiveFrom,
    'DELEGATION_DATE_RANGE_INVALID',
    'วันสิ้นสุดการมอบหมายต้องไม่ก่อนวันเริ่ม',
  );
  return input;
}

export interface AdjustmentInput {
  sourceType: 'request' | 'payroll_item' | 'obligation' | 'settlement';
  sourceId: string;
  sourceRound?: number;
  targetMonth: string;
  reason: string;
  delta: Record<string, unknown>;
}

export function validateAdjustment(input: AdjustmentInput): AdjustmentInput {
  invariant(
    /^20\d{2}-(0[1-9]|1[0-2])$/.test(input.targetMonth),
    'ADJUSTMENT_MONTH_INVALID',
    'เดือนของรายการปรับปรุงไม่ถูกต้อง',
  );
  invariant(
    input.reason.trim().length >= 3 && input.reason.trim().length <= 2000,
    'ADJUSTMENT_REASON_REQUIRED',
    'ต้องระบุเหตุผลของรายการปรับปรุง',
  );
  invariant(
    Object.keys(input.delta).length > 0,
    'ADJUSTMENT_DELTA_REQUIRED',
    'ต้องระบุสิ่งที่ต้องปรับปรุง',
  );
  if (input.sourceRound !== undefined) {
    invariant(
      Number.isInteger(input.sourceRound) && input.sourceRound > 0,
      'ADJUSTMENT_SOURCE_ROUND_INVALID',
      'รอบอ้างอิงของรายการปรับปรุงไม่ถูกต้อง',
    );
  }
  return { ...input, reason: input.reason.trim() };
}
