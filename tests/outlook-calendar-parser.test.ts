import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarDeltaPage } from '../src/server/integrations/outlook-calendar-parser';
import { initialCalendarDeltaUrl } from '../src/server/integrations/outlook-graph';

test('calendar delta parser accepts an empty valid page', () => {
  assert.deepEqual(parseCalendarDeltaPage({ value: [] }), {
    events: [],
    removedEventIds: [],
    nextLink: null,
    deltaLink: null,
  });
});

test('calendar delta request includes event type for recurring-series filtering', () => {
  const url = new URL(
    initialCalendarDeltaUrl('employee@example.com', {
      start: '2026-08-01',
      end: '2026-11-01',
    }),
  );
  assert.equal(url.searchParams.get('$select')?.split(',').includes('type'), true);
});

test('calendar delta parser ignores series masters but keeps occurrences', () => {
  const parsed = parseCalendarDeltaPage({
    value: [
      {
        id: 'series-master',
        type: 'seriesMaster',
        changeKey: 'master-v1',
        subject: 'Old recurring master',
        categories: ['IES · Onsite'],
        start: { dateTime: '2022-04-27T09:00:00.0000000' },
        end: { dateTime: '2022-04-27T10:00:00.0000000' },
        isAllDay: false,
        location: { displayName: 'Office' },
        isCancelled: false,
      },
      {
        id: 'occurrence-2026',
        type: 'occurrence',
        changeKey: 'occurrence-v1',
        subject: 'Customer onsite',
        categories: ['IES · Onsite'],
        start: { dateTime: '2026-09-28T13:00:00.0000000' },
        end: { dateTime: '2026-09-28T14:00:00.0000000' },
        isAllDay: false,
        location: { displayName: 'Customer' },
        isCancelled: false,
      },
    ],
  });

  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0]?.eventId, 'occurrence-2026');
  assert.equal(parsed.events[0]?.localStart, '2026-09-28T13:00:00');
});
