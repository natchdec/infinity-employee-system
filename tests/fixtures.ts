import type { Actor } from '../src/domain/core';
import type { Calendar } from '../src/domain/calendar';
import type {
  OTPolicy,
  LeavePolicy,
  MileagePolicy,
  PerDiemPolicy,
  ExpensePolicy,
} from '../src/domain/policy';

/** Synthetic UAT values only. Never install as real employee data or company policy automatically. */
export const calendar: Calendar = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] };
export const otPolicy: OTPolicy = {
  salaryDivisorDays: 30,
  normalDailyHours: 8,
  maxDailyHours: 16,
  maxWeeklyHours: 36,
  rounding: 'half_up_per_line',
  categories: [
    {
      id: 'weekday_ot',
      label: 'OT วันทำงาน',
      dayKind: 'working',
      legalKind: 'weekday_overtime',
      multiplierBasisPoints: 15000,
      maxHours: 16,
    },
    {
      id: 'holiday_work',
      label: 'งานในวันหยุด',
      dayKind: 'holiday',
      legalKind: 'holiday_work_paid',
      multiplierBasisPoints: 10000,
      maxHours: 8,
    },
    {
      id: 'holiday_ot',
      label: 'OT วันหยุด',
      dayKind: 'holiday',
      legalKind: 'holiday_overtime',
      multiplierBasisPoints: 30000,
      maxHours: 16,
    },
  ],
};
export const leavePolicy: LeavePolicy = {
  unit: 'full_day',
  types: [
    {
      id: 'annual',
      label: 'ลาพักร้อน',
      entitlementDays: 10,
      paidDays: 10,
      payBasisPoints: 10000,
      counting: 'working',
      period: 'year',
      minimumServiceDays: 365,
      evidenceRequired: false,
      legallyVerified: true,
      legalReference: 'LPA s30/s56; company fixture 10 days',
    },
    {
      id: 'sick',
      label: 'ลาป่วย',
      entitlementDays: null,
      paidDays: 30,
      payBasisPoints: 10000,
      counting: 'working',
      period: 'year',
      minimumServiceDays: 0,
      evidenceRequired: false,
      legallyVerified: true,
      legalReference: 'LPA s32/s57; proof rules separately reviewed',
    },
    {
      id: 'business',
      label: 'ลากิจจำเป็น',
      entitlementDays: 3,
      paidDays: 3,
      payBasisPoints: 10000,
      counting: 'working',
      period: 'year',
      minimumServiceDays: 0,
      evidenceRequired: false,
      legallyVerified: true,
      legalReference: 'LPA amendment 7, s34/s57-1',
    },
    {
      id: 'maternity',
      label: 'ลาคลอด',
      entitlementDays: 120,
      paidDays: 60,
      payBasisPoints: 10000,
      counting: 'calendar',
      period: 'event',
      minimumServiceDays: 0,
      evidenceRequired: true,
      legallyVerified: true,
      legalReference: 'LPA amendment 9 effective 2025-12-07, s41/s59',
    },
  ],
};
export const mileagePolicy: MileagePolicy = {
  rateSatangPerKm: '800',
  deduction: 'per_eligible_home_leg',
  rounding: 'half_up_per_leg',
  allowManualAttestation: true,
};
export const perDiemPolicy: PerDiemPolicy = {
  domesticRateSatang: '50000',
  internationalRateSatang: '160000',
  counting: 'inclusive_calendar_days',
  currency: 'THB',
  settlementDueDays: 3,
};
export const expensePolicy: ExpensePolicy = {
  maxClaimSatang: '100000000',
  categories: [
    {
      id: 'mileage',
      label: 'รถส่วนตัว',
      evidenceRequired: false,
      originalRequired: false,
      enabled: true,
    },
    {
      id: 'taxi',
      label: 'แท็กซี่',
      evidenceRequired: true,
      originalRequired: false,
      enabled: true,
    },
    { id: 'grab', label: 'Grab', evidenceRequired: true, originalRequired: false, enabled: true },
    {
      id: 'toll',
      label: 'ค่าทางด่วน',
      evidenceRequired: true,
      originalRequired: true,
      enabled: true,
    },
    {
      id: 'parking',
      label: 'ค่าจอดรถ',
      evidenceRequired: true,
      originalRequired: true,
      enabled: true,
    },
    {
      id: 'rental_car',
      label: 'เช่ารถ',
      evidenceRequired: true,
      originalRequired: true,
      enabled: true,
    },
    {
      id: 'fuel',
      label: 'ค่าน้ำมัน',
      evidenceRequired: true,
      originalRequired: true,
      enabled: true,
    },
    { id: 'hotel', label: 'โรงแรม', evidenceRequired: true, originalRequired: true, enabled: true },
    {
      id: 'entertainment',
      label: 'รับรองลูกค้า',
      evidenceRequired: true,
      originalRequired: true,
      enabled: true,
    },
    { id: 'other', label: 'อื่น ๆ', evidenceRequired: true, originalRequired: true, enabled: true },
  ],
};
export const employee: Actor = {
  id: 'employee-a',
  displayName: 'พนักงานทดสอบ',
  email: 'employee@example.invalid',
  roles: ['employee'],
  isHeadOwner: false,
  active: true,
};
export const head: Actor = {
  ...employee,
  id: 'head-a',
  roles: ['employee', 'head'],
  isHeadOwner: true,
};
export const finance: Actor = {
  ...employee,
  id: 'finance-a',
  roles: ['employee', 'finance', 'admin'],
  isHeadOwner: true,
};
