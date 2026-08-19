const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const REQUEST_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATABASE_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?$/;

class EventScheduleError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function parseDate(date) {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));

  if (
    value.getUTCFullYear() !== year
    || value.getUTCMonth() !== month - 1
    || value.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseRequestTime(time) {
  const match = REQUEST_TIME_PATTERN.exec(time);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function isValidCalendarDate(date) {
  return typeof date === 'string' && parseDate(date) !== null;
}

function isValidRequestTime(time) {
  return typeof time === 'string' && parseRequestTime(time) !== null;
}

function isValidIanaTimezone(timezone) {
  if (typeof timezone !== 'string' || timezone.length === 0) return false;

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format();
  } catch {
    return false;
  }

  // Intl accepts legacy abbreviations such as EST. Require an IANA-style
  // identifier while retaining UTC as the standard zero-offset identifier.
  return timezone === 'UTC' || timezone.includes('/');
}

function formatterFor(timezone) {
  return new Intl.DateTimeFormat('en-CA-u-ca-iso8601', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function zonedParts(formatter, instant) {
  const values = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function sameLocalMinute(left, right) {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

function resolveLocalDateTime(date, time, timezone) {
  const dateParts = parseDate(date);
  const timeParts = parseRequestTime(time);

  if (!dateParts) throw new EventScheduleError('date', 'Invalid calendar date');
  if (!timeParts) throw new EventScheduleError('startTime', 'Time must use HH:mm');
  if (!isValidIanaTimezone(timezone)) {
    throw new EventScheduleError('timezone', 'Invalid IANA timezone');
  }

  const desired = { ...dateParts, ...timeParts };
  const localAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  const formatter = formatterFor(timezone);
  const offsets = new Set();

  // Sampling either side of the requested local time captures both offsets at
  // DST transitions without depending on the API server's local timezone.
  for (const hours of [-48, -24, -12, 0, 12, 24, 48]) {
    const sample = new Date(localAsUtc + hours * 60 * 60 * 1000);
    const parts = zonedParts(formatter, sample);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    offsets.add(representedAsUtc - sample.getTime());
  }

  const matches = [];
  for (const offset of offsets) {
    const candidate = new Date(localAsUtc - offset);
    if (sameLocalMinute(zonedParts(formatter, candidate), desired)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    throw new EventScheduleError('date', 'Local date and time do not exist in this timezone');
  }

  // During a fall-back overlap, consistently choose the earlier occurrence.
  matches.sort((left, right) => left.getTime() - right.getTime());
  return matches[0];
}

function validateEventSchedule(event, options = {}) {
  const { requireFuture = true, now = new Date() } = options;
  let startInstant;
  let endInstant;

  try {
    startInstant = resolveLocalDateTime(event.date, event.startTime, event.timezone);
  } catch (error) {
    if (error instanceof EventScheduleError && error.field === 'startTime') throw error;
    throw error;
  }

  try {
    endInstant = resolveLocalDateTime(event.date, event.endTime, event.timezone);
  } catch (error) {
    if (error instanceof EventScheduleError && error.field === 'startTime') {
      throw new EventScheduleError('endTime', error.message);
    }
    throw error;
  }

  if (event.endTime <= event.startTime) {
    throw new EventScheduleError('endTime', 'End time must be later than start time');
  }

  if (endInstant <= startInstant) {
    throw new EventScheduleError('endTime', 'End time must be later than start time');
  }

  if (requireFuture && startInstant <= now) {
    throw new EventScheduleError('startTime', 'Event start must be in the future');
  }

  return { startInstant, endInstant };
}

function normalizeDatabaseTime(time) {
  if (typeof time !== 'string') {
    throw new EventScheduleError('time', 'Database time must be a string');
  }

  const match = DATABASE_TIME_PATTERN.exec(time);
  if (!match) throw new EventScheduleError('time', 'Invalid database time');
  return `${match[1]}:${match[2]}`;
}

module.exports = {
  EventScheduleError,
  isValidCalendarDate,
  isValidIanaTimezone,
  isValidRequestTime,
  normalizeDatabaseTime,
  resolveLocalDateTime,
  validateEventSchedule,
};
