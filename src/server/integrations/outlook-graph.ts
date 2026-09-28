import { invariant } from '../../domain/core';
import type { CalendarSyncWindow } from './outlook-calendar';

export function initialCalendarDeltaUrl(email: string, window: CalendarSyncWindow): string {
  invariant(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    'OUTLOOK_MAILBOX_INVALID',
    'อีเมลพนักงานสำหรับ Outlook Calendar ไม่ถูกต้อง',
    503,
  );
  const url = new URL(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendarView/delta`,
  );
  url.searchParams.set('startDateTime', `${window.start}T00:00:00+07:00`);
  url.searchParams.set('endDateTime', `${window.end}T00:00:00+07:00`);
  url.searchParams.set(
    '$select',
    'id,type,changeKey,subject,categories,start,end,isAllDay,location,isCancelled',
  );
  return url.toString();
}
