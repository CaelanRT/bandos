const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EventScheduleError,
  isValidCalendarDate,
  isValidIanaTimezone,
  normalizeDatabaseTime,
  resolveLocalDateTime,
  validateEventSchedule,
} = require('../utils/event-schedule');

test('strictly validates calendar dates and IANA timezone names', () => {
  assert.equal(isValidCalendarDate('2026-02-28'), true);
  assert.equal(isValidCalendarDate('2026-02-29'), false);
  assert.equal(isValidCalendarDate('2026-2-08'), false);
  assert.equal(isValidIanaTimezone('America/Toronto'), true);
  assert.equal(isValidIanaTimezone('EST'), false);
});

test('resolves a Toronto local time independently of server timezone', () => {
  const instant = resolveLocalDateTime('2026-09-12', '19:30', 'America/Toronto');
  assert.equal(instant.toISOString(), '2026-09-12T23:30:00.000Z');
});

test('rejects a nonexistent daylight-saving wall-clock time', () => {
  assert.throws(
    () => resolveLocalDateTime('2026-03-08', '02:30', 'America/Toronto'),
    (error) => error instanceof EventScheduleError,
  );
});

test('chooses the earlier instant during a daylight-saving overlap', () => {
  const instant = resolveLocalDateTime('2026-11-01', '01:30', 'America/Toronto');
  assert.equal(instant.toISOString(), '2026-11-01T05:30:00.000Z');
});

test('requires a start strictly later than the current instant', () => {
  const event = {
    date: '2026-09-12',
    startTime: '19:30',
    endTime: '20:30',
    timezone: 'America/Toronto',
  };

  assert.throws(
    () => validateEventSchedule(event, { now: new Date('2026-09-12T23:30:00.000Z') }),
    (error) => error.field === 'startTime',
  );
  assert.doesNotThrow(
    () => validateEventSchedule(event, { now: new Date('2026-09-12T23:29:59.999Z') }),
  );
});

test('normalizes PostgreSQL time values to HH:mm', () => {
  assert.equal(normalizeDatabaseTime('19:30:00'), '19:30');
  assert.equal(normalizeDatabaseTime('19:30:00.123456'), '19:30');
  assert.equal(normalizeDatabaseTime('19:30'), '19:30');
});
