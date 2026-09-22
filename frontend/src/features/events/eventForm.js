import { isLaterSameDay, isRealDate, isSupportedTimezone, isTime, resolveLocalDateTime } from './schedule.js'

export const eventFieldNames = ['name', 'type', 'date', 'startTime', 'endTime', 'timezone', 'location', 'description']

export const emptyEventValues = {
  name: '', type: '', date: '', startTime: '', endTime: '', timezone: '', location: '', description: '',
}

export function normalizeEventValues(values) {
  return {
    name: values.name.trim(),
    type: values.type,
    date: values.date,
    startTime: values.startTime,
    endTime: values.endTime,
    timezone: values.timezone.trim(),
    location: values.location.trim(),
    description: values.description.trim() || null,
  }
}

export function eventValues(event) {
  return Object.fromEntries(eventFieldNames.map((field) => [field, event[field] ?? '']))
}

export function changedEventValues(values, originalValues) {
  const current = normalizeEventValues(values)
  const original = normalizeEventValues(originalValues)
  return Object.fromEntries(eventFieldNames
    .filter((field) => current[field] !== original[field])
    .map((field) => [field, current[field]]))
}

export function validateEventValues(values, now = new Date()) {
  const body = normalizeEventValues(values)
  const errors = {}
  if (!body.name) errors.name = 'Enter an event name.'
  else if (body.name.length > 100) errors.name = 'Use 100 characters or fewer.'
  if (!['rehearsal', 'performance'].includes(body.type)) errors.type = 'Choose rehearsal or performance.'
  if (!body.date) errors.date = 'Choose a date.'
  else if (!isRealDate(body.date)) errors.date = 'Enter a real date.'
  if (!body.startTime) errors.startTime = 'Choose a start time.'
  else if (!isTime(body.startTime)) errors.startTime = 'Enter a valid start time.'
  if (!body.endTime) errors.endTime = 'Choose an end time.'
  else if (!isTime(body.endTime)) errors.endTime = 'Enter a valid end time.'
  if (isTime(body.startTime) && isTime(body.endTime) && !isLaterSameDay(body.startTime, body.endTime)) {
    errors.endTime = 'End time must be later than start time.'
  }
  if (!body.timezone) errors.timezone = 'Choose a timezone.'
  else if (body.timezone.length > 255 || !isSupportedTimezone(body.timezone)) errors.timezone = 'Choose a supported timezone.'
  if (!body.location) errors.location = 'Enter a location.'
  else if (body.location.length > 255) errors.location = 'Use 255 characters or fewer.'
  if (body.description !== null && body.description.length > 2000) errors.description = 'Use 2,000 characters or fewer.'

  if (!errors.date && !errors.startTime && !errors.timezone) {
    const start = resolveLocalDateTime(body.date, body.startTime, body.timezone)
    if (start === null) errors.startTime = 'That local start time does not exist in the selected timezone.'
    else if (start <= now) errors.startTime = 'Choose a start time in the future.'
    if (!errors.endTime && resolveLocalDateTime(body.date, body.endTime, body.timezone) === null) {
      errors.endTime = 'That local end time does not exist in the selected timezone.'
    }
  }
  return errors
}

export function eventTimezoneOptions() {
  try {
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
    return [...new Set(['UTC', ...zones])]
  } catch {
    return ['UTC']
  }
}

export function timezoneLabel(timezone) {
  return timezone === 'UTC' ? 'UTC' : timezone.replaceAll('_', ' ')
}
