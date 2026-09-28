import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarDeltaPage } from '../src/server/integrations/outlook-calendar-parser';

test('calendar delta parser accepts an empty valid page', () => {
  assert.deepEqual(parseCalendarDeltaPage({ value: [] }), {
    events: [],
    removedEventIds: [],
    nextLink: null,
    deltaLink: null,
  });
});
