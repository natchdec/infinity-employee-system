import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarSyncWindow,
  shouldResetCalendarDelta,
} from '../src/server/integrations/outlook-calendar';

test('Outlook sync window is stable for a whole Bangkok calendar month', () => {
  assert.deepEqual(calendarSyncWindow(new Date('2026-09-05T12:00:00+07:00')), {
    start: '2026-08-01',
    end: '2026-11-01',
  });
  assert.deepEqual(calendarSyncWindow(new Date('2026-09-28T23:00:00+07:00')), {
    start: '2026-08-01',
    end: '2026-11-01',
  });
});

test('delta token is reset only when its bound view window changes', () => {
  const expected = { start: '2026-08-01', end: '2026-11-01' };
  assert.equal(shouldResetCalendarDelta('2026-08-01', '2026-11-01', expected), false);
  assert.equal(shouldResetCalendarDelta('2026-07-01', '2026-10-01', expected), true);
});
