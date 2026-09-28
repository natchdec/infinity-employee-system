import { invariant } from './core';

export interface TimedWorklogCandidate {
  id: string;
  localStart: string;
  localEnd: string;
  intent: 'ot' | 'onsite' | 'leave';
  locationLabel?: string | null;
}

export interface WorklogConflict {
  code: 'OT_OVERLAP' | 'ONSITE_LOCATION_REQUIRED' | 'ONSITE_MULTI_STOP_REVIEW';
  itemIds: string[];
}

const LOCAL_DATE_TIME =
  /^(19|20|21)\d{2}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;

function minuteKey(value: string): number {
  invariant(LOCAL_DATE_TIME.test(value), 'INVALID_LOCAL_DATETIME', 'เวลา Calendar ไม่ถูกต้อง');
  return Date.parse(`${value}+07:00`) / 60000;
}

export function detectWorklogConflicts(items: readonly TimedWorklogCandidate[]): WorklogConflict[] {
  const conflicts: WorklogConflict[] = [];
  const ot = items
    .filter((item) => item.intent === 'ot')
    .map((item) => ({ ...item, start: minuteKey(item.localStart), end: minuteKey(item.localEnd) }))
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  for (let index = 0; index < ot.length; index++) {
    const current = ot[index]!;
    invariant(
      current.end > current.start,
      'INVALID_EVENT_RANGE',
      'เวลาสิ้นสุด Calendar ต้องหลังเวลาเริ่ม',
    );
    const overlapping = [current.id];
    for (let next = index + 1; next < ot.length && ot[next]!.start < current.end; next++) {
      if (ot[next]!.end > current.start) overlapping.push(ot[next]!.id);
    }
    if (overlapping.length > 1) {
      const itemIds = [...new Set(overlapping)].sort();
      if (
        !conflicts.some(
          (conflict) =>
            conflict.code === 'OT_OVERLAP' && conflict.itemIds.join('|') === itemIds.join('|'),
        )
      ) {
        conflicts.push({ code: 'OT_OVERLAP', itemIds });
      }
    }
  }

  const onsiteByDate = new Map<string, string[]>();
  for (const item of items) {
    if (item.intent !== 'onsite') continue;
    if (!item.locationLabel?.trim()) {
      conflicts.push({ code: 'ONSITE_LOCATION_REQUIRED', itemIds: [item.id] });
      continue;
    }
    const date = item.localStart.slice(0, 10);
    const grouped = onsiteByDate.get(date) ?? [];
    grouped.push(item.id);
    onsiteByDate.set(date, grouped);
  }
  for (const itemIds of onsiteByDate.values()) {
    if (itemIds.length > 1) {
      conflicts.push({
        code: 'ONSITE_MULTI_STOP_REVIEW',
        itemIds: [...itemIds].sort(),
      });
    }
  }
  return conflicts;
}

export interface OnsiteStop {
  itemId: string;
  localStart: string;
  locationLabel: string;
}

export interface OnsiteRoutePlan {
  date: string;
  origin: 'office';
  destination: 'office';
  stops: { itemId: string; locationLabel: string }[];
  needsReview: boolean;
}

export function planDailyOnsiteRoute(stops: readonly OnsiteStop[]): OnsiteRoutePlan | null {
  if (!stops.length) return null;
  const ordered = [...stops].sort(
    (a, b) => minuteKey(a.localStart) - minuteKey(b.localStart) || a.itemId.localeCompare(b.itemId),
  );
  const date = ordered[0]!.localStart.slice(0, 10);
  invariant(
    ordered.every((stop) => stop.localStart.slice(0, 10) === date),
    'ONSITE_MULTI_DAY_ROUTE',
    'ต้องวางเส้นทาง Onsite แยกตามวัน',
  );
  for (const stop of ordered) {
    invariant(stop.locationLabel.trim(), 'ONSITE_LOCATION_REQUIRED', 'Onsite ต้องมีสถานที่');
  }
  return {
    date,
    origin: 'office',
    destination: 'office',
    stops: ordered.map((stop) => ({
      itemId: stop.itemId,
      locationLabel: stop.locationLabel.trim(),
    })),
    needsReview: ordered.length > 1,
  };
}

export type WorklogReviewState =
  'suggested' | 'confirmed' | 'ignored' | 'submitted' | 'exception' | 'cancelled';

export function sourceChangeTransition(
  current: WorklogReviewState,
  sourceStillEligible: boolean,
): { state: WorklogReviewState; exceptionCode: string | null; immutableRequest: boolean } {
  if (current === 'submitted') {
    return {
      state: 'submitted',
      exceptionCode: 'SOURCE_CHANGED_AFTER_SUBMIT',
      immutableRequest: true,
    };
  }
  if (!sourceStillEligible) {
    return {
      state: 'cancelled',
      exceptionCode: 'SOURCE_EVENT_CANCELLED',
      immutableRequest: false,
    };
  }
  if (current === 'confirmed') {
    return {
      state: 'exception',
      exceptionCode: 'SOURCE_CHANGED_REVIEW',
      immutableRequest: false,
    };
  }
  if (current === 'ignored') {
    return { state: 'ignored', exceptionCode: null, immutableRequest: false };
  }
  return { state: 'suggested', exceptionCode: null, immutableRequest: false };
}
