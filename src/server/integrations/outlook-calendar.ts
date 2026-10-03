import { addDays, bangkokDate } from '../../domain/calendar';

export interface CalendarSyncWindow {
  start: string;
  end: string;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function calendarSyncWindow(now = new Date()): CalendarSyncWindow {
  const today = bangkokDate(now);
  const current = monthStart(today);
  const previous = monthStart(addDays(current, -1));
  const nextMonthBoundary = monthStart(addDays(`${today.slice(0, 7)}-28`, 7));
  const end = monthStart(addDays(`${nextMonthBoundary.slice(0, 7)}-28`, 7));
  return { start: previous, end };
}

export function shouldResetCalendarDelta(
  storedStart: string | null,
  storedEnd: string | null,
  expected: CalendarSyncWindow,
): boolean {
  return storedStart !== expected.start || storedEnd !== expected.end;
}
