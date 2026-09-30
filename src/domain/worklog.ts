import { addDays, dateRange, isWorkingDay, isoDate, type Calendar } from './calendar';
import { invariant } from './core';

export const OUTLOOK_WORK_CATEGORIES = {
  ot: 'IES · OT',
  onsite: 'IES · Onsite',
  annual: 'IES · ลาพักร้อน',
  sick: 'IES · ลาป่วย',
  business: 'IES · ลากิจ',
  maternity: 'IES · ลาคลอด',
  ordination: 'IES · ลาอุปสมบท',
  military: 'IES · ลารับราชการทหาร',
} as const;

const leaveCategoryMap = new Map<string, string>([
  [OUTLOOK_WORK_CATEGORIES.annual, 'annual'],
  [OUTLOOK_WORK_CATEGORIES.sick, 'sick'],
  [OUTLOOK_WORK_CATEGORIES.business, 'business'],
  [OUTLOOK_WORK_CATEGORIES.maternity, 'maternity'],
  [OUTLOOK_WORK_CATEGORIES.ordination, 'ordination'],
  [OUTLOOK_WORK_CATEGORIES.military, 'military'],
]);

export interface CalendarWorkEvent {
  eventId: string;
  occurrenceId: string;
  changeKey: string;
  subject: string;
  categories: string[];
  localStart: string;
  localEnd: string;
  isAllDay: boolean;
  locationLabel: string | null;
  cancelled?: boolean;
}

export interface WorkingSchedule {
  workStart: string;
  workEnd: string;
  lunchStart: string | null;
  lunchEnd: string | null;
  timeZone: 'Asia/Bangkok';
}

export interface OTSuggestionDay {
  date: string;
  rawEligibleMinutes: number;
  suggestedHours: number;
  dayKind: 'working' | 'holiday';
  needsReview: boolean;
}

export type WorklogSuggestion =
  | {
      intent: 'ot';
      status: 'suggested' | 'exception';
      exceptionCode: string | null;
      days: OTSuggestionDay[];
      totalSuggestedHours: number;
    }
  | {
      intent: 'onsite';
      status: 'suggested' | 'exception';
      exceptionCode: string | null;
      locationLabel: string | null;
    }
  | {
      intent: 'leave';
      status: 'suggested' | 'exception';
      exceptionCode: string | null;
      leaveTypeId: string;
      start: string;
      end: string;
    };

const LOCAL_DATE_TIME =
  /^(19|20|21)\d{2}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;

function localParts(value: string): { date: string; minutes: number } {
  invariant(LOCAL_DATE_TIME.test(value), 'INVALID_LOCAL_DATETIME', 'เวลา Calendar ไม่ถูกต้อง');
  const date = isoDate(value.slice(0, 10));
  const [hour, minute] = value.slice(11, 16).split(':').map(Number);
  return { date, minutes: hour! * 60 + minute! };
}

function clockMinutes(value: string): number {
  invariant(
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    'INVALID_WORKING_SCHEDULE',
    'เวลาทำงานไม่ถูกต้อง',
  );
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

export function workingSchedule(calendar: Calendar): WorkingSchedule {
  const schedule = {
    workStart: calendar.workStart ?? '09:00',
    workEnd: calendar.workEnd ?? '18:00',
    lunchStart: calendar.lunchStart ?? '12:00',
    lunchEnd: calendar.lunchEnd ?? '13:00',
    timeZone: calendar.timeZone ?? 'Asia/Bangkok',
  } satisfies WorkingSchedule;
  invariant(
    clockMinutes(schedule.workStart) < clockMinutes(schedule.workEnd),
    'INVALID_WORKING_SCHEDULE',
    'เวลาเลิกงานต้องหลังเวลาเริ่มงาน',
  );
  if (schedule.lunchStart && schedule.lunchEnd) {
    invariant(
      schedule.workStart < schedule.lunchStart &&
        schedule.lunchStart < schedule.lunchEnd &&
        schedule.lunchEnd < schedule.workEnd,
      'INVALID_WORKING_SCHEDULE',
      'ช่วงพักต้องอยู่ภายในเวลาทำงาน',
    );
  }
  return schedule;
}

function overlapMinutes(start: number, end: number, rangeStart: number, rangeEnd: number): number {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

export function suggestCalendarOT(
  localStart: string,
  localEnd: string,
  calendar: Calendar,
): OTSuggestionDay[] {
  const start = localParts(localStart);
  const end = localParts(localEnd);
  const dates = dateRange(start.date, end.date, 8);
  invariant(
    end.date > start.date || end.minutes > start.minutes,
    'INVALID_EVENT_RANGE',
    'เวลาสิ้นสุด Calendar ต้องหลังเวลาเริ่ม',
  );
  const schedule = workingSchedule(calendar);
  const officeStart = clockMinutes(schedule.workStart);
  const officeEnd = clockMinutes(schedule.workEnd);

  return dates
    .map((date, index) => {
      const segmentStart = index === 0 ? start.minutes : 0;
      const segmentEnd = index === dates.length - 1 ? end.minutes : 1440;
      const rawEligibleMinutes = isWorkingDay(date, calendar)
        ? overlapMinutes(segmentStart, segmentEnd, 0, officeStart) +
          overlapMinutes(segmentStart, segmentEnd, officeEnd, 1440)
        : Math.max(0, segmentEnd - segmentStart);
      const halfHourUnits = Math.floor(rawEligibleMinutes / 30);
      return {
        date,
        rawEligibleMinutes,
        suggestedHours: halfHourUnits / 2,
        dayKind: isWorkingDay(date, calendar) ? ('working' as const) : ('holiday' as const),
        needsReview:
          rawEligibleMinutes % 30 !== 0 || (rawEligibleMinutes > 0 && halfHourUnits === 0),
      };
    })
    .filter((day) => day.rawEligibleMinutes > 0);
}

export function classifyCalendarEvent(
  event: CalendarWorkEvent,
  calendar: Calendar,
): WorklogSuggestion[] {
  if (event.cancelled) return [];
  invariant(
    event.eventId.trim().length > 0,
    'CALENDAR_EVENT_ID_REQUIRED',
    'Calendar event ไม่มีรหัส',
  );
  invariant(
    event.changeKey.trim().length > 0,
    'CALENDAR_CHANGE_KEY_REQUIRED',
    'Calendar event ไม่มี revision',
  );

  const selected = new Set(event.categories.filter((category) => category.startsWith('IES · ')));
  if (selected.size === 0) return [];

  const start = localParts(event.localStart);
  const end = localParts(event.localEnd);
  const invalidRange =
    end.date < start.date || (end.date === start.date && end.minutes <= start.minutes);
  if (invalidRange) {
    const review: WorklogSuggestion[] = [];
    if (selected.has(OUTLOOK_WORK_CATEGORIES.ot)) {
      review.push({
        intent: 'ot',
        status: 'exception',
        exceptionCode: 'CALENDAR_TIME_RANGE_REVIEW',
        days: [],
        totalSuggestedHours: 0,
      });
    }
    if (selected.has(OUTLOOK_WORK_CATEGORIES.onsite)) {
      review.push({
        intent: 'onsite',
        status: 'exception',
        exceptionCode: 'CALENDAR_TIME_RANGE_REVIEW',
        locationLabel: event.locationLabel?.trim() || null,
      });
    }
    for (const [category, leaveTypeId] of leaveCategoryMap) {
      if (!selected.has(category)) continue;
      review.push({
        intent: 'leave',
        status: 'exception',
        exceptionCode: 'CALENDAR_TIME_RANGE_REVIEW',
        leaveTypeId,
        start: start.date,
        end: end.date,
      });
    }
    return review;
  }

  const suggestions: WorklogSuggestion[] = [];
  if (selected.has(OUTLOOK_WORK_CATEGORIES.ot)) {
    if (event.isAllDay) {
      suggestions.push({
        intent: 'ot',
        status: 'exception',
        exceptionCode: 'OT_ALL_DAY_REVIEW',
        days: [],
        totalSuggestedHours: 0,
      });
    } else {
      const days = suggestCalendarOT(event.localStart, event.localEnd, calendar);
      const totalSuggestedHours = days.reduce((sum, day) => sum + day.suggestedHours, 0);
      const needsReview = days.some((day) => day.needsReview) || totalSuggestedHours < 0.5;
      suggestions.push({
        intent: 'ot',
        status: needsReview ? 'exception' : 'suggested',
        exceptionCode: needsReview ? 'OT_DURATION_REVIEW' : null,
        days,
        totalSuggestedHours,
      });
    }
  }

  if (selected.has(OUTLOOK_WORK_CATEGORIES.onsite)) {
    const hasLocation = Boolean(event.locationLabel?.trim());
    suggestions.push({
      intent: 'onsite',
      status: hasLocation ? 'suggested' : 'exception',
      exceptionCode: hasLocation ? null : 'ONSITE_LOCATION_REQUIRED',
      locationLabel: hasLocation ? event.locationLabel!.trim() : null,
    });
  }

  for (const [category, leaveTypeId] of leaveCategoryMap) {
    if (!selected.has(category)) continue;
    const start = isoDate(event.localStart.slice(0, 10));
    const exclusiveEnd = isoDate(event.localEnd.slice(0, 10));
    const end = addDays(exclusiveEnd, -1);
    suggestions.push({
      intent: 'leave',
      status: event.isAllDay ? 'suggested' : 'exception',
      exceptionCode: event.isAllDay ? null : 'LEAVE_FULL_DAY_REQUIRED',
      leaveTypeId,
      start,
      end,
    });
  }
  return suggestions;
}
