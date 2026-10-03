import { z } from 'zod';
import { invariant, fingerprint } from './core';
import { isoDate } from './calendar';

export const dateSchema = z.string().refine((value) => {
  try {
    isoDate(value);
    return true;
  } catch {
    return false;
  }
}, 'วันที่ไม่ถูกต้อง');
const satang = z.string().regex(/^(0|[1-9]\d{0,10})$/);
const positiveSatang = satang.refine((value) => BigInt(value) > 0n);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const calendarPolicySchema = z
  .object({
    workingWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    holidays: z.array(dateSchema).max(200),
    workStart: clockTime.optional(),
    workEnd: clockTime.optional(),
    lunchStart: clockTime.optional(),
    lunchEnd: clockTime.optional(),
    timeZone: z.literal('Asia/Bangkok').optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.workingWeekdays).size !== value.workingWeekdays.length) {
      context.addIssue({ code: 'custom', path: ['workingWeekdays'], message: 'วันทำงานซ้ำกัน' });
    }
    const configured = Boolean(
      value.workStart || value.workEnd || value.lunchStart || value.lunchEnd || value.timeZone,
    );
    if (!configured) return;
    if (!value.workStart || !value.workEnd || !value.timeZone) {
      context.addIssue({
        code: 'custom',
        path: ['workStart'],
        message: 'Working Schedule ต้องมีเวลาเริ่ม เลิก และ timezone ครบ',
      });
      return;
    }
    if (value.workStart >= value.workEnd) {
      context.addIssue({
        code: 'custom',
        path: ['workEnd'],
        message: 'เวลาเลิกงานต้องหลังเวลาเริ่มงาน',
      });
    }
    if (Boolean(value.lunchStart) !== Boolean(value.lunchEnd)) {
      context.addIssue({
        code: 'custom',
        path: ['lunchStart'],
        message: 'ช่วงพักต้องมีเวลาเริ่มและสิ้นสุดครบ',
      });
    }
    if (
      value.lunchStart &&
      value.lunchEnd &&
      !(
        value.workStart < value.lunchStart &&
        value.lunchStart < value.lunchEnd &&
        value.lunchEnd < value.workEnd
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lunchEnd'],
        message: 'ช่วงพักต้องอยู่ภายในเวลาทำงาน',
      });
    }
  });

export const leaveTypeSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z_]{1,40}$/),
    label: z.string().min(1).max(100),
    entitlementDays: z.number().int().min(0).max(366).nullable(),
    paidDays: z.number().int().min(0).max(366).nullable(),
    payBasisPoints: z.number().int().min(0).max(10000),
    counting: z.enum(['working', 'calendar']),
    period: z.enum(['year', 'event']),
    minimumServiceDays: z.number().int().min(0).max(730),
    evidenceRequired: z.boolean(),
    legallyVerified: z.boolean(),
    legalReference: z.string().min(1).max(500),
  })
  .strict();

export const leavePolicySchema = z
  .object({
    unit: z.literal('full_day'),
    types: z.array(leaveTypeSchema).min(1).max(30),
  })
  .strict()
  .refine((value) => new Set(value.types.map((item) => item.id)).size === value.types.length);

export const otCategorySchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z_]{1,40}$/),
    label: z.string().min(1).max(100),
    dayKind: z.enum(['working', 'holiday']),
    legalKind: z.enum(['weekday_overtime', 'holiday_work_paid', 'holiday_overtime']),
    multiplierBasisPoints: z.number().int().min(10000).max(100000),
    maxHours: z.number().int().min(1).max(24),
  })
  .strict();

export const otPolicySchema = z
  .object({
    salaryDivisorDays: z.literal(30),
    normalDailyHours: z.number().int().min(1).max(8),
    maxDailyHours: z.number().int().min(1).max(24),
    maxWeeklyHours: z.number().int().min(1).max(36),
    rounding: z.literal('half_up_per_line'),
    categories: z.array(otCategorySchema).min(1).max(12),
  })
  .strict()
  .refine(
    (value) => new Set(value.categories.map((item) => item.id)).size === value.categories.length,
  );

export const mileagePolicySchema = z
  .object({
    rateSatangPerKm: positiveSatang,
    deduction: z.literal('per_eligible_home_leg'),
    rounding: z.literal('half_up_per_leg'),
    allowManualAttestation: z.boolean(),
  })
  .strict();

export const perDiemPolicySchema = z
  .object({
    domesticRateSatang: positiveSatang.nullable(),
    internationalRateSatang: positiveSatang.nullable(),
    counting: z.literal('inclusive_calendar_days'),
    currency: z.literal('THB'),
    settlementDueDays: z.number().int().min(1).max(30),
  })
  .strict();

export const payrollPolicySchema = z
  .object({
    cutoffDay: z.number().int().min(2).max(28),
    payday: z.number().int().min(2).max(28),
    cutoffBasis: z.literal('end_last_workday_before_cutoff'),
    timeZone: z.literal('Asia/Bangkok'),
  })
  .strict();

export const expenseCategories = [
  'mileage',
  'taxi',
  'grab',
  'toll',
  'parking',
  'rental_car',
  'fuel',
  'hotel',
  'entertainment',
  'other',
] as const;
export const expensePolicySchema = z
  .object({
    categories: z
      .array(
        z
          .object({
            id: z.enum(expenseCategories),
            label: z.string().min(1).max(100),
            evidenceRequired: z.boolean(),
            originalRequired: z.boolean(),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    maxClaimSatang: positiveSatang,
  })
  .strict()
  .refine(
    (value) => new Set(value.categories.map((item) => item.id)).size === value.categories.length,
  );

export const approvalPolicySchema = z
  .object({
    manager: z.literal('line_head'),
    ownerHeadSkip: z.literal(true),
    financeIndependent: z.literal(true),
    projectManagerApproval: z.literal(false),
  })
  .strict();

export const policySchemas = {
  calendar: calendarPolicySchema,
  leave: leavePolicySchema,
  ot: otPolicySchema,
  mileage: mileagePolicySchema,
  per_diem: perDiemPolicySchema,
  payroll: payrollPolicySchema,
  expense: expensePolicySchema,
  approval: approvalPolicySchema,
};
export type PolicyFamily = keyof typeof policySchemas;
export type LeavePolicy = z.infer<typeof leavePolicySchema>;
export type OTPolicy = z.infer<typeof otPolicySchema>;
export type MileagePolicy = z.infer<typeof mileagePolicySchema>;
export type PerDiemPolicy = z.infer<typeof perDiemPolicySchema>;
export type ExpensePolicy = z.infer<typeof expensePolicySchema>;
export interface VersionedPolicy<T = unknown> {
  id: string;
  family: PolicyFamily;
  version: number;
  effectiveFrom: string;
  status: 'draft' | 'published';
  body: T;
  hash: string;
}

/** Statutory floors for ordinary monthly employees, with explicit eligibility outside this function. */
export function validateLegalFloors(family: PolicyFamily, body: unknown): void {
  if (family === 'ot') {
    const parsed = otPolicySchema.parse(body);
    for (const category of parsed.categories) {
      const minimum = {
        weekday_overtime: 15000,
        holiday_work_paid: 10000,
        holiday_overtime: 30000,
      }[category.legalKind];
      invariant(
        category.multiplierBasisPoints >= minimum,
        'LEGAL_OT_FLOOR',
        'ตัวคูณ OT ต่ำกว่ากฎหมายที่ใช้กับประเภทงานนี้',
      );
      invariant(
        category.dayKind === (category.legalKind === 'weekday_overtime' ? 'working' : 'holiday'),
        'OT_CATEGORY_DAY_MISMATCH',
        'ประเภท OT ไม่ตรงกับประเภทวัน',
      );
    }
  }
  if (family === 'leave') {
    for (const type of leavePolicySchema.parse(body).types) {
      invariant(
        type.legallyVerified,
        'LEGAL_REVIEW_REQUIRED',
        'ต้องตรวจสอบกฎหมายและวิธีนับวันของประเภทลาก่อนเผยแพร่',
      );
      const floors: Record<
        string,
        { entitlement: number | null; paid: number; counting?: string; rate: number }
      > = {
        annual: { entitlement: 6, paid: 6, counting: 'working', rate: 10000 },
        sick: { entitlement: null, paid: 30, counting: 'working', rate: 10000 },
        business: { entitlement: 3, paid: 3, counting: 'working', rate: 10000 },
        maternity: { entitlement: 120, paid: 60, counting: 'calendar', rate: 10000 },
        maternity_child_care: { entitlement: 15, paid: 15, rate: 5000 },
        spouse_birth: { entitlement: 15, paid: 15, rate: 10000 },
        military: { entitlement: null, paid: 60, rate: 10000 },
      };
      const floor = floors[type.id];
      if (!floor) continue;
      invariant(
        floor.entitlement === null
          ? type.entitlementDays === null
          : type.entitlementDays === null || type.entitlementDays >= floor.entitlement,
        'LEGAL_LEAVE_ENTITLEMENT',
        'สิทธิ์ลาต่ำกว่าหลักกฎหมาย',
      );
      invariant(
        (type.paidDays === null || type.paidDays >= floor.paid) &&
          type.payBasisPoints >= floor.rate,
        'LEGAL_LEAVE_PAY',
        'สิทธิ์ค่าจ้างระหว่างลาต่ำกว่าหลักกฎหมาย',
      );
      if (floor.counting)
        invariant(
          type.counting === floor.counting,
          'LEGAL_LEAVE_COUNTING',
          'วิธีนับวันลาไม่ตรงกับหลักกฎหมาย',
        );
      if (type.id === 'annual')
        invariant(
          type.minimumServiceDays <= 365,
          'LEGAL_SERVICE_PERIOD',
          'ระยะเวลารอสิทธิ์พักร้อนเกินขอบเขต',
        );
    }
  }
}

export function parsePolicy(family: PolicyFamily, body: unknown): unknown {
  return policySchemas[family].parse(body);
}

export function selectPolicy<T>(
  versions: readonly VersionedPolicy<T>[],
  date: string,
): VersionedPolicy<T> {
  isoDate(date);
  const applicable = versions
    .filter((value) => value.status === 'published' && value.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  invariant(applicable[0], 'POLICY_NOT_CONFIGURED', 'ยังไม่มีนโยบายที่มีผลสำหรับวันที่รายการนี้');
  invariant(
    !applicable[1] || applicable[0].effectiveFrom !== applicable[1].effectiveFrom,
    'AMBIGUOUS_POLICY',
    'พบนโยบายที่มีผลซ้ำกัน',
  );
  invariant(
    fingerprint(applicable[0].body) === applicable[0].hash,
    'POLICY_INTEGRITY',
    'ข้อมูลนโยบายไม่ตรงกับหลักฐานที่บันทึกไว้',
    500,
  );
  return applicable[0];
}
