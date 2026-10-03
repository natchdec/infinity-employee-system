import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCalendarEvent,
  OUTLOOK_WORK_CATEGORIES,
  suggestCalendarOT,
} from '../src/domain/worklog';
import { calendar } from './fixtures';

const baseEvent = {
  eventId: 'event-1',
  occurrenceId: '2026-09-28',
  changeKey: 'change-1',
  subject: 'Customer visit',
  categories: [] as string[],
  localStart: '2026-09-28T09:00:00',
  localEnd: '2026-09-28T18:00:00',
  isAllDay: false,
  locationLabel: 'Customer A',
};

test('ordinary Outlook events are ignored unless explicitly categorized for IES', () => {
  assert.deepEqual(classifyCalendarEvent(baseEvent, calendar), []);
});

test('OT suggestion counts only time outside configurable office hours', () => {
  const days = suggestCalendarOT('2026-09-28T17:00:00', '2026-09-28T21:30:00', {
    ...calendar,
    workStart: '09:00',
    workEnd: '18:00',
  });
  assert.deepEqual(days, [
    {
      date: '2026-09-28',
      rawEligibleMinutes: 210,
      suggestedHours: 3.5,
      dayKind: 'working',
      needsReview: false,
    },
  ]);
});

test('OT suggestion flags non-half-hour Calendar duration instead of rounding silently', () => {
  const [suggestion] = classifyCalendarEvent(
    {
      ...baseEvent,
      categories: [OUTLOOK_WORK_CATEGORIES.ot],
      localStart: '2026-09-28T18:00:00',
      localEnd: '2026-09-28T19:45:00',
    },
    calendar,
  );
  assert.equal(suggestion?.intent, 'ot');
  if (suggestion?.intent === 'ot') {
    assert.equal(suggestion.totalSuggestedHours, 1.5);
    assert.equal(suggestion.status, 'exception');
    assert.equal(suggestion.exceptionCode, 'OT_DURATION_REVIEW');
  }
});

test('one Calendar event can create both Onsite and OT suggestions', () => {
  const suggestions = classifyCalendarEvent(
    {
      ...baseEvent,
      categories: [OUTLOOK_WORK_CATEGORIES.onsite, OUTLOOK_WORK_CATEGORIES.ot],
      localEnd: '2026-09-28T20:00:00',
    },
    calendar,
  );
  assert.deepEqual(
    suggestions.map((item) => item.intent),
    ['ot', 'onsite'],
  );
  assert.equal(suggestions[0]?.status, 'suggested');
  assert.equal(suggestions[1]?.status, 'suggested');
});

test('Onsite without a location requires employee review', () => {
  const [suggestion] = classifyCalendarEvent(
    {
      ...baseEvent,
      categories: [OUTLOOK_WORK_CATEGORIES.onsite],
      locationLabel: null,
    },
    calendar,
  );
  assert.deepEqual(suggestion, {
    intent: 'onsite',
    status: 'exception',
    exceptionCode: 'ONSITE_LOCATION_REQUIRED',
    locationLabel: null,
  });
});

test('Thai leave category requires an all-day Outlook event', () => {
  const [valid] = classifyCalendarEvent(
    {
      ...baseEvent,
      categories: [OUTLOOK_WORK_CATEGORIES.annual],
      localStart: '2026-10-08T00:00:00',
      localEnd: '2026-10-09T00:00:00',
      isAllDay: true,
    },
    calendar,
  );
  assert.deepEqual(valid, {
    intent: 'leave',
    status: 'suggested',
    exceptionCode: null,
    leaveTypeId: 'annual',
    start: '2026-10-08',
    end: '2026-10-08',
  });

  const [invalid] = classifyCalendarEvent(
    {
      ...baseEvent,
      categories: [OUTLOOK_WORK_CATEGORIES.sick],
      localStart: '2026-10-08T10:00:00',
      localEnd: '2026-10-08T15:00:00',
      isAllDay: false,
    },
    calendar,
  );
  assert.equal(invalid?.status, 'exception');
  assert.equal(invalid?.exceptionCode, 'LEAVE_FULL_DAY_REQUIRED');
});

test('holiday Calendar time is preserved for later OT category mapping', () => {
  const [day] = suggestCalendarOT('2026-09-26T09:00:00', '2026-09-26T12:30:00', calendar);
  assert.equal(day?.dayKind, 'holiday');
  assert.equal(day?.suggestedHours, 3.5);
});

test('zero-duration IES event becomes a review exception instead of breaking calendar sync', () => {
  const suggestions = classifyCalendarEvent(
    {
      ...baseEvent,
      categories: [OUTLOOK_WORK_CATEGORIES.onsite, OUTLOOK_WORK_CATEGORIES.ot],
      localStart: '2026-09-16T17:00:00',
      localEnd: '2026-09-16T17:00:00',
    },
    calendar,
  );

  assert.deepEqual(
    suggestions.map((item) => ({
      intent: item.intent,
      status: item.status,
      exceptionCode: item.exceptionCode,
    })),
    [
      {
        intent: 'ot',
        status: 'exception',
        exceptionCode: 'CALENDAR_TIME_RANGE_REVIEW',
      },
      {
        intent: 'onsite',
        status: 'exception',
        exceptionCode: 'CALENDAR_TIME_RANGE_REVIEW',
      },
    ],
  );
});
