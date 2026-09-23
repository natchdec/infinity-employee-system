import { invariant } from './core';

const DAY_MS = 86_400_000;
export const BUSINESS_TIME_ZONE = 'Asia/Bangkok';
export interface Calendar {
  workingWeekdays: number[];
  holidays: string[];
}
export interface PayrollRule {
  cutoffDay: number;
  payday: number;
}

export function isoDate(value: string): string {
  invariant(
    typeof value === 'string' && /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value),
    'INVALID_DATE',
    'ระบุวันที่ในรูปแบบ YYYY-MM-DD',
  );
  const parsed = new Date(`${value}T00:00:00.000Z`);
  invariant(
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
    'INVALID_DATE',
    'วันที่ไม่มีอยู่จริง',
  );
  return value;
}

export function addDays(date: string, days: number): string {
  isoDate(date);
  invariant(
    Number.isSafeInteger(days) && Math.abs(days) <= 3660,
    'INVALID_DAY_OFFSET',
    'จำนวนวันไม่ถูกต้อง',
  );
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function bangkokDate(instant: Date): string {
  invariant(Number.isFinite(instant.getTime()), 'INVALID_INSTANT', 'เวลาระบบไม่ถูกต้อง');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function weekday(date: string): number {
  return new Date(`${isoDate(date)}T00:00:00Z`).getUTCDay();
}

export function isWorkingDay(date: string, calendar: Calendar): boolean {
  return calendar.workingWeekdays.includes(weekday(date)) && !calendar.holidays.includes(date);
}

export function dateRange(start: string, end: string, limit = 366): string[] {
  isoDate(start);
  isoDate(end);
  const length =
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
  invariant(
    length >= 1 && length <= limit,
    'INVALID_DATE_RANGE',
    'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม และช่วงวันต้องอยู่ในขอบเขตที่กำหนด',
  );
  return Array.from({ length }, (_, index) => addDays(start, index));
}

export function countedDates(
  start: string,
  end: string,
  basis: 'working' | 'calendar',
  calendar: Calendar,
): string[] {
  const dates = dateRange(start, end);
  return basis === 'calendar' ? dates : dates.filter((date) => isWorkingDay(date, calendar));
}

export function nextMonth(month: string): string {
  invariant(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), 'INVALID_MONTH', 'รอบเดือนเงินเดือนไม่ถูกต้อง');
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

/** Exclusive cutoff: midnight immediately after the last working day BEFORE the nominal 24th. */
export function payrollCutoff(
  month: string,
  calendar: Calendar,
  rule: PayrollRule = { cutoffDay: 24, payday: 25 },
): Date {
  invariant(
    Number.isInteger(rule.cutoffDay) && rule.cutoffDay >= 2 && rule.cutoffDay <= 28,
    'INVALID_CUTOFF_POLICY',
    'วันตัดรอบไม่ถูกต้อง',
  );
  invariant(calendar.workingWeekdays.length > 0, 'INVALID_CALENDAR', 'ต้องกำหนดวันทำงาน');
  let day = addDays(isoDate(`${month}-${String(rule.cutoffDay).padStart(2, '0')}`), -1);
  let attempts = 0;
  while (!isWorkingDay(day, calendar)) {
    invariant(++attempts <= 31, 'NO_WORKING_DAY', 'ไม่พบวันทำงานก่อนตัดรอบ กรุณาตรวจปฏิทิน');
    day = addDays(day, -1);
  }
  // Bangkok has UTC+07:00 for the supported operating dates. All conversion stays here.
  return new Date(`${addDays(day, 1)}T00:00:00.000+07:00`);
}

export function payrollAssignment(
  approvedAt: Date,
  workDate: string,
  calendarFor: (month: string) => Calendar,
  rule: PayrollRule = { cutoffDay: 24, payday: 25 },
  unavailableMonths: ReadonlySet<string> = new Set(),
): { month: string; cutoffAt: string; payday: string } {
  isoDate(workDate);
  let month = [bangkokDate(approvedAt).slice(0, 7), workDate.slice(0, 7)].sort().at(-1)!;
  for (let i = 0; i < 24; i++) {
    const cutoff = payrollCutoff(month, calendarFor(month), rule);
    if (approvedAt < cutoff && !unavailableMonths.has(month)) {
      return {
        month,
        cutoffAt: cutoff.toISOString(),
        payday: isoDate(`${month}-${String(rule.payday).padStart(2, '0')}`),
      };
    }
    month = nextMonth(month);
  }
  throw new Error('No available payroll cycle within the planning horizon');
}

export function settlementDueDate(tripEnd: string, dueDays = 3): string {
  invariant(
    Number.isInteger(dueDays) && dueDays >= 1 && dueDays <= 30,
    'INVALID_SETTLEMENT_POLICY',
    'จำนวนวันเคลียร์ค่าใช้จ่ายไม่ถูกต้อง',
  );
  return addDays(tripEnd, dueDays);
}

export function settlementState(
  tripEnd: string,
  now: Date,
  settled: boolean,
  dueDays = 3,
): 'active' | 'settlement_due' | 'due_today' | 'overdue' | 'settled' {
  if (settled) return 'settled';
  const today = bangkokDate(now);
  if (today <= isoDate(tripEnd)) return 'active';
  const due = settlementDueDate(tripEnd, dueDays);
  return today < due ? 'settlement_due' : today === due ? 'due_today' : 'overdue';
}
