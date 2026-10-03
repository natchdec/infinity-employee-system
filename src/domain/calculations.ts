import { invariant, integer, roundRatio, money } from './core';
import { countedDates, dateRange, isWorkingDay, isoDate, type Calendar } from './calendar';
import type { OTPolicy, MileagePolicy, PerDiemPolicy, LeavePolicy } from './policy';

export interface OTInputLine {
  categoryId: string;
  hours: number;
}
export interface WageBasis {
  monthlySatang: string;
  normalDailyHours: number;
  eligibility: 'eligible' | 'ineligible' | 'unknown';
}
export function calculateOT(
  date: string,
  lines: readonly OTInputLine[],
  wage: WageBasis,
  policy: OTPolicy,
  calendar: Calendar,
) {
  isoDate(date);
  invariant(
    wage.eligibility === 'eligible',
    'OT_ELIGIBILITY_REQUIRED',
    'ต้องยืนยันสิทธิ์ OT ของพนักงานก่อนคำนวณ',
  );
  invariant(
    /^\d+$/.test(wage.monthlySatang) && BigInt(wage.monthlySatang) > 0n,
    'WAGE_REQUIRED',
    'ต้องมีฐานค่าจ้างที่มีผล',
  );
  integer(wage.normalDailyHours, 1, 8);
  invariant(
    lines.length > 0 && lines.length <= policy.categories.length,
    'OT_LINES_REQUIRED',
    'ระบุชั่วโมง OT อย่างน้อยหนึ่งประเภท',
  );
  invariant(
    new Set(lines.map((line) => line.categoryId)).size === lines.length,
    'DUPLICATE_OT_CATEGORY',
    'ประเภท OT ซ้ำกัน',
  );
  const dayKind = isWorkingDay(date, calendar) ? 'working' : 'holiday';
  const calculated = lines.map((line) => {
    const category = policy.categories.find((item) => item.id === line.categoryId);
    invariant(category, 'UNKNOWN_OT_CATEGORY', 'ประเภท OT ไม่มีในนโยบายนี้');
    const halfHourUnits = line.hours * 2;
    invariant(
      line.hours >= 0.5 && line.hours <= category.maxHours && Number.isInteger(halfHourUnits),
      'HALF_HOUR_INCREMENT_REQUIRED',
      'ชั่วโมง OT ต้องไม่น้อยกว่า 0.5 ชั่วโมงและเพิ่มทีละ 0.5 ชั่วโมง',
    );
    invariant(
      category.dayKind === dayKind,
      'OT_DAY_CATEGORY',
      'ประเภท OT ไม่ตรงกับวันทำงานหรือวันหยุด',
    );
    const amount = roundRatio(
      BigInt(wage.monthlySatang) * BigInt(halfHourUnits) * BigInt(category.multiplierBasisPoints),
      BigInt(policy.salaryDivisorDays * wage.normalDailyHours * 2) * 10000n,
    );
    return {
      categoryId: category.id,
      label: category.label,
      hours: line.hours,
      multiplierBasisPoints: category.multiplierBasisPoints,
      amountSatang: amount.toString(),
    };
  });
  const totalHours = calculated.reduce((sum, line) => sum + line.hours, 0);
  invariant(
    totalHours <= policy.maxDailyHours,
    'OT_DAILY_LIMIT',
    'ชั่วโมงรวมเกินเพดานต่อวันของนโยบาย',
  );
  return {
    date,
    dayKind,
    lines: calculated,
    totalHours,
    totalSatang: calculated.reduce((sum, line) => sum + BigInt(line.amountSatang), 0n).toString(),
    rounding: policy.rounding,
  };
}

export type EndpointKind = 'home' | 'office' | 'customer' | 'other';
export interface MileageLeg {
  origin: EndpointKind;
  destination: EndpointKind;
  originLabel: string;
  destinationLabel: string;
  distanceMetres: number;
  source: 'manual_attested' | 'google_routes';
  providerReference?: string;
}
export function calculateMileage(
  legs: readonly MileageLeg[],
  commuteMetres: number,
  policy: MileagePolicy,
) {
  integer(commuteMetres, 0, 500_000);
  invariant(
    legs.length > 0 && legs.length <= 20,
    'MILEAGE_LEGS_REQUIRED',
    'ต้องมีเที่ยวเดินทางอย่างน้อยหนึ่งเที่ยว',
  );
  const snapshots = legs.map((leg, index) => {
    integer(leg.distanceMetres, 1, 3_000_000);
    invariant(
      !(leg.origin === 'home' && leg.destination === 'home'),
      'INVALID_MILEAGE_LEG',
      'เที่ยวบ้านถึงบ้านไม่เข้าเกณฑ์',
    );
    invariant(
      !(leg.origin === 'office' && leg.destination === 'office'),
      'INVALID_MILEAGE_LEG',
      'เที่ยวสำนักงานถึงสำนักงานไม่เข้าเกณฑ์',
    );
    const ordinaryCommute =
      (leg.origin === 'home' && leg.destination === 'office') ||
      (leg.origin === 'office' && leg.destination === 'home');
    invariant(
      !ordinaryCommute,
      'ORDINARY_COMMUTE_NOT_REIMBURSABLE',
      'การเดินทางบ้านถึงสำนักงานตามปกติไม่ใช่ค่าเดินทางไปปฏิบัติงาน',
    );
    if (leg.source === 'manual_attested')
      invariant(
        policy.allowManualAttestation,
        'MANUAL_ROUTE_DISABLED',
        'นโยบายนี้ต้องใช้ผู้ให้บริการระยะทางที่ยืนยันแล้ว',
      );
    const homeLeg = leg.origin === 'home' || leg.destination === 'home';
    const deduction = homeLeg ? Math.min(commuteMetres, leg.distanceMetres) : 0;
    const eligibleMetres = leg.distanceMetres - deduction;
    return {
      ...leg,
      line: index + 1,
      commuteMetresSnapshot: commuteMetres,
      deductionMetres: deduction,
      eligibleMetres,
      rateSatangPerKm: policy.rateSatangPerKm,
      amountSatang: roundRatio(
        BigInt(eligibleMetres) * BigInt(policy.rateSatangPerKm),
        1000n,
      ).toString(),
    };
  });
  return {
    legs: snapshots,
    eligibleMetres: snapshots.reduce((sum, line) => sum + line.eligibleMetres, 0),
    totalSatang: snapshots.reduce((sum, line) => sum + BigInt(line.amountSatang), 0n).toString(),
    rounding: policy.rounding,
  };
}

export function calculatePerDiem(
  start: string,
  end: string,
  region: 'domestic' | 'international',
  requested: boolean,
  policy: PerDiemPolicy,
) {
  const days = dateRange(start, end, 90).length;
  if (!requested)
    return {
      days,
      region,
      requested: false,
      rateSatang: '0',
      totalSatang: '0',
      currency: policy.currency,
    };
  const rate = region === 'domestic' ? policy.domesticRateSatang : policy.internationalRateSatang;
  invariant(
    rate !== null && BigInt(rate) > 0n,
    'PER_DIEM_NOT_CONFIGURED',
    'ยังไม่ได้กำหนดอัตราเบี้ยเลี้ยง กรุณาให้ผู้ดูแลเผยแพร่นโยบาย',
  );
  return {
    days,
    region,
    requested: true,
    rateSatang: rate,
    totalSatang: (BigInt(days) * BigInt(rate)).toString(),
    currency: policy.currency,
  };
}

export function calculateSettlement(actualSatang: string, paidAdvanceSatang: string) {
  invariant(
    /^\d+$/.test(actualSatang) && /^\d+$/.test(paidAdvanceSatang),
    'INVALID_SETTLEMENT_AMOUNT',
    'ยอดเคลียร์ค่าใช้จ่ายไม่ถูกต้อง',
  );
  const net = BigInt(actualSatang) - BigInt(paidAdvanceSatang);
  return {
    actualSatang,
    paidAdvanceSatang,
    netSatang: net.toString(),
    direction: net > 0n ? 'company_top_up' : net < 0n ? 'employee_refund' : 'balanced',
    movementSatang: (net < 0n ? -net : net).toString(),
  };
}

export function calculateLeave(
  input: { typeId: string; start: string; end: string; unit: string },
  policy: LeavePolicy,
  calendar: Calendar,
  hireDate: string,
  usedDays: number,
  usedPaidDays: number,
  eventReference?: string,
) {
  invariant(input.unit === 'full_day', 'FULL_DAY_ONLY', 'ระบบรองรับการลาเต็มวันเท่านั้น');
  const type = policy.types.find((item) => item.id === input.typeId);
  invariant(
    type && type.legallyVerified,
    'LEAVE_TYPE_NOT_ENABLED',
    'ประเภทลายังไม่ได้รับการยืนยันนโยบาย',
  );
  isoDate(hireDate);
  invariant(input.start >= hireDate, 'LEAVE_BEFORE_HIRE', 'วันลาอยู่ก่อนวันเริ่มงาน');
  const serviceDays = Math.round(
    (Date.parse(`${input.start}T00:00:00Z`) - Date.parse(`${hireDate}T00:00:00Z`)) / 86_400_000,
  );
  invariant(
    serviceDays >= type.minimumServiceDays,
    'LEAVE_SERVICE_REQUIREMENT',
    'ยังไม่ถึงระยะเวลาทำงานที่มีสิทธิ์ตามนโยบาย',
  );
  invariant(
    type.period === 'event' || input.start.slice(0, 4) === input.end.slice(0, 4),
    'LEAVE_SPLIT_YEAR',
    'กรุณาแยกคำขอลาตามปีสิทธิ์',
  );
  if (type.period === 'event')
    invariant(
      eventReference && eventReference.trim().length >= 3,
      'LEAVE_EVENT_REFERENCE',
      'ต้องระบุเหตุการณ์อ้างอิงของสิทธิ์ลานี้',
    );
  const dates = countedDates(input.start, input.end, type.counting, calendar);
  invariant(dates.length > 0, 'NO_LEAVE_DAYS', 'ช่วงวันที่นี้ไม่มีวันลาที่ต้องใช้สิทธิ์');
  if (type.entitlementDays !== null)
    invariant(
      usedDays + dates.length <= type.entitlementDays,
      'INSUFFICIENT_LEAVE_BALANCE',
      'สิทธิ์ลาคงเหลือไม่เพียงพอ',
    );
  const paidDays =
    type.paidDays === null
      ? dates.length
      : Math.max(0, Math.min(dates.length, type.paidDays - usedPaidDays));
  return {
    typeId: type.id,
    label: type.label,
    dates,
    days: dates.length,
    paidDays,
    unpaidDays: dates.length - paidDays,
    payBasisPoints: type.payBasisPoints,
    period: type.period === 'year' ? input.start.slice(0, 4) : eventReference!,
    counting: type.counting,
    evidenceRequired: type.evidenceRequired,
  };
}

export function sumClaimAmounts(amounts: readonly string[]): string {
  return amounts.reduce((sum, amount) => sum + money(amount), 0n).toString();
}
