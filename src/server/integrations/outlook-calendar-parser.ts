import { invariant } from '../../domain/core';
import type { CalendarWorkEvent } from '../../domain/worklog';

interface GraphEvent {
  id?: unknown;
  type?: unknown;
  changeKey?: unknown;
  subject?: unknown;
  categories?: unknown;
  start?: { dateTime?: unknown };
  end?: { dateTime?: unknown };
  isAllDay?: unknown;
  location?: { displayName?: unknown };
  isCancelled?: unknown;
  '@odata.etag'?: unknown;
  '@removed'?: unknown;
}

export interface ParsedCalendarDeltaPage {
  events: CalendarWorkEvent[];
  removedEventIds: string[];
  nextLink: string | null;
  deltaLink: string | null;
}

function localDateTime(value: unknown): string {
  invariant(
    typeof value === 'string',
    'CALENDAR_RESPONSE_INVALID',
    'เวลา Calendar ไม่ถูกต้อง',
    503,
  );
  const normalized = value.slice(0, 19);
  invariant(
    /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized),
    'CALENDAR_RESPONSE_INVALID',
    'เวลา Calendar ไม่ถูกต้อง',
    503,
  );
  return normalized;
}

function parseCategories(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseEvent(raw: GraphEvent): CalendarWorkEvent | null {
  invariant(
    typeof raw.id === 'string' && raw.id.length > 0,
    'CALENDAR_RESPONSE_INVALID',
    'Calendar event ไม่มีรหัส',
    503,
  );
  if (raw['@removed'] || raw.type === 'seriesMaster') return null;

  const eventCategories = parseCategories(raw.categories);
  const isIES = eventCategories.some((category) => category.startsWith('IES · '));
  const revision =
    typeof raw.changeKey === 'string'
      ? raw.changeKey
      : typeof raw['@odata.etag'] === 'string'
        ? raw['@odata.etag']
        : `event:${raw.id}`;

  return {
    eventId: raw.id,
    occurrenceId: raw.id,
    changeKey: revision,
    subject: isIES && typeof raw.subject === 'string' ? raw.subject : '',
    categories: eventCategories,
    localStart: localDateTime(raw.start?.dateTime),
    localEnd: localDateTime(raw.end?.dateTime),
    isAllDay: raw.isAllDay === true,
    locationLabel:
      isIES && typeof raw.location?.displayName === 'string' && raw.location.displayName.trim()
        ? raw.location.displayName.trim()
        : null,
    cancelled: raw.isCancelled === true,
  };
}

export function parseCalendarDeltaPage(payload: unknown): ParsedCalendarDeltaPage {
  invariant(
    payload && typeof payload === 'object' && !Array.isArray(payload),
    'CALENDAR_RESPONSE_INVALID',
    'ข้อมูล Calendar ไม่ถูกต้อง',
    503,
  );
  const page = payload as Record<string, unknown>;
  invariant(
    Array.isArray(page.value),
    'CALENDAR_RESPONSE_INVALID',
    'ข้อมูล Calendar ไม่ถูกต้อง',
    503,
  );

  const events: CalendarWorkEvent[] = [];
  const removedEventIds: string[] = [];
  for (const item of page.value) {
    invariant(
      item && typeof item === 'object' && !Array.isArray(item),
      'CALENDAR_RESPONSE_INVALID',
      'ข้อมูล Calendar ไม่ถูกต้อง',
      503,
    );
    const raw = item as GraphEvent;
    if (raw['@removed']) {
      invariant(
        typeof raw.id === 'string' && raw.id.length > 0,
        'CALENDAR_RESPONSE_INVALID',
        'Calendar event ไม่มีรหัส',
        503,
      );
      removedEventIds.push(raw.id);
      continue;
    }
    const event = parseEvent(raw);
    if (event) events.push(event);
  }

  return {
    events,
    removedEventIds: [...new Set(removedEventIds)],
    nextLink: typeof page['@odata.nextLink'] === 'string' ? page['@odata.nextLink'] : null,
    deltaLink: typeof page['@odata.deltaLink'] === 'string' ? page['@odata.deltaLink'] : null,
  };
}

export function safeGraphDeltaLink(raw: string): string {
  const url = new URL(raw);
  invariant(
    url.origin === 'https://graph.microsoft.com' && url.pathname.startsWith('/v1.0/'),
    'CALENDAR_DELTA_LINK_INVALID',
    'Calendar sync token ไม่ถูกต้อง',
    503,
  );
  return url.toString();
}
