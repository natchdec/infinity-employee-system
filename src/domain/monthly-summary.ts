import { invariant } from './core';

export interface MonthlyStatementInput {
  otHours: number;
  otSatang: bigint;
  mileageMetres: number;
  mileageSatang: bigint;
  expenseSatang: bigint;
  advanceSatang: bigint;
  settlementSatang: bigint;
  leaveDays: number;
  paymentStates: readonly string[];
}

export interface MonthlyStatement {
  otHours: number;
  otSatang: string;
  mileageKm: number;
  mileageSatang: string;
  expenseSatang: string;
  advanceSatang: string;
  settlementSatang: string;
  leaveDays: number;
  paymentStatus: 'none' | 'pending' | 'partial' | 'paid';
}

export function monthlyStatement(input: MonthlyStatementInput): MonthlyStatement {
  invariant(
    Number.isFinite(input.otHours) && input.otHours >= 0 && Number.isInteger(input.otHours * 2),
    'STATEMENT_OT_INVALID',
    'ชั่วโมง OT ในสรุปรายเดือนไม่ถูกต้อง',
  );
  invariant(
    Number.isInteger(input.mileageMetres) && input.mileageMetres >= 0,
    'STATEMENT_MILEAGE_INVALID',
    'ระยะทางในสรุปรายเดือนไม่ถูกต้อง',
  );
  invariant(
    Number.isInteger(input.leaveDays) && input.leaveDays >= 0,
    'STATEMENT_LEAVE_INVALID',
    'จำนวนวันลาในสรุปรายเดือนไม่ถูกต้อง',
  );
  for (const amount of [
    input.otSatang,
    input.mileageSatang,
    input.expenseSatang,
    input.advanceSatang,
    input.settlementSatang,
  ]) {
    invariant(amount >= 0n, 'STATEMENT_AMOUNT_INVALID', 'ยอดเงินในสรุปรายเดือนไม่ถูกต้อง');
  }

  const states = input.paymentStates.filter((state) => state !== 'not_applicable');
  const paid = states.filter((state) => state === 'paid').length;
  const paymentStatus =
    states.length === 0
      ? 'none'
      : paid === states.length
        ? 'paid'
        : paid > 0
          ? 'partial'
          : 'pending';

  return {
    otHours: input.otHours,
    otSatang: input.otSatang.toString(),
    mileageKm: Math.round((input.mileageMetres / 1000) * 10) / 10,
    mileageSatang: input.mileageSatang.toString(),
    expenseSatang: input.expenseSatang.toString(),
    advanceSatang: input.advanceSatang.toString(),
    settlementSatang: input.settlementSatang.toString(),
    leaveDays: input.leaveDays,
    paymentStatus,
  };
}

export interface ExceptionCandidate {
  id: string;
  kind:
    | 'ot_overlap'
    | 'onsite_location'
    | 'leave_partial_day'
    | 'mileage_route'
    | 'receipt_missing'
    | 'calendar_source_changed'
    | 'configuration';
  severity: 'review' | 'blocking';
  resolved: boolean;
}

export function exceptionInbox(items: readonly ExceptionCandidate[]): ExceptionCandidate[] {
  return items
    .filter((item) => !item.resolved)
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'blocking' ? -1 : 1;
      return a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
    });
}

export interface ReminderCandidate {
  eventKey: string;
  employeeId: string;
  kind:
    | 'calendar_review'
    | 'approval_pending'
    | 'receipt_gap'
    | 'settlement_due'
    | 'payroll_cutoff'
    | 'finance_queue';
  title: string;
  href: string;
  dueAt: Date | null;
  completed: boolean;
}

export function activeReminders(
  candidates: readonly ReminderCandidate[],
  now: Date,
): ReminderCandidate[] {
  invariant(Number.isFinite(now.getTime()), 'INVALID_INSTANT', 'เวลาระบบไม่ถูกต้อง');
  const seen = new Set<string>();
  return candidates
    .filter((item) => !item.completed && (!item.dueAt || item.dueAt <= now))
    .filter((item) => {
      if (seen.has(item.eventKey)) return false;
      seen.add(item.eventKey);
      return true;
    })
    .sort((a, b) => {
      const left = a.dueAt?.getTime() ?? 0;
      const right = b.dueAt?.getTime() ?? 0;
      return left - right || a.eventKey.localeCompare(b.eventKey);
    });
}
