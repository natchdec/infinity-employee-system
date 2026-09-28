import { invariant } from '../../domain/core';

export async function outlookGraphJson(url: string): Promise<unknown> {
  void url;
  invariant(
    false,
    'OUTLOOK_CALENDAR_AUTH_NOT_READY',
    'Outlook Calendar sync ยังรอการเปิดสิทธิ์ Microsoft Graph Calendars.Read',
    503,
  );
}
