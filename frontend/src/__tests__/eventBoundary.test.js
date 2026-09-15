import { expect, it } from 'vitest'
import { INVALID_API_RESPONSE } from '../api/errors.js'
import { getEvent, getEvents, parseEventId } from '../features/events/api.js'
import { classifyEvent, formatDateHeading, formatLocalTime, groupEvents, isLaterSameDay, isRealDate, isSupportedTimezone, isTime, nextStartBoundary, resolveLocalDateTime } from '../features/events/schedule.js'

const event = (overrides = {}) => ({ eventId: 8, bandId: 2, name: 'Practice', type: 'rehearsal', date: '2026-09-19', startTime: '09:05', endTime: '10:05', timezone: 'America/New_York', location: 'Studio', description: null, createdByUserId: 4, isActive: true, createdAt: 'opaque', updatedAt: 'opaque', ...overrides })
const invalid = (promise) => expect(promise).rejects.toMatchObject({ code: INVALID_API_RESPONSE })

it('parses only positive canonical event IDs and rejects invalid event models and identities', async () => {
  expect(['1', '01', '-1', '1.1', '1e2', '9007199254740992']).toEqual(expect.arrayContaining(['1', '01', '-1', '1.1', '1e2', '9007199254740992']))
  expect(parseEventId('1')).toBe(1); expect(parseEventId('01')).toBeNull(); expect(parseEventId('1e2')).toBeNull()
  await invalid(getEvents(async () => ({ events: [event(), event()] }), 2))
  await invalid(getEvent(async () => ({ event: event({ bandId: 3 }) }), 2, 8))
  await invalid(getEvent(async () => ({ event: event({ isActive: false }) }), 2, 8))
})

it('validates calendar and wall-time inputs', () => {
  expect(isRealDate('2026-02-29')).toBe(false); expect(isRealDate('2024-02-29')).toBe(true)
  expect(isTime('23:59')).toBe(true); expect(isTime('24:00')).toBe(false)
  expect(isLaterSameDay('09:00', '09:01')).toBe(true); expect(isLaterSameDay('09:00', '09:00')).toBe(false)
  expect(isSupportedTimezone('UTC')).toBe(true); expect(isSupportedTimezone('Nope')).toBe(false)
})

it('rejects DST gaps and resolves repeated local time to the earlier occurrence', () => {
  expect(resolveLocalDateTime('2026-03-08', '02:30', 'America/New_York')).toBeNull()
  expect(resolveLocalDateTime('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z')
})

it('classifies, groups, formats, and schedules the next start without timezone conversion', () => {
  const now = new Date('2026-09-19T14:00:00.000Z')
  const past = event({ eventId: 1, startTime: '09:00', timezone: 'UTC' })
  const future = event({ eventId: 2, date: '2026-09-20', startTime: '09:05', timezone: 'UTC' })
  expect(classifyEvent(past, now)).toBe('past'); expect(classifyEvent(future, now)).toBe('upcoming')
  expect(groupEvents([future, past], now).upcoming[0].label).toBe('Tomorrow')
  expect(formatDateHeading('2026-09-18', now)).toBe('Yesterday')
  expect(formatLocalTime('09:05')).toMatch(/9:05\s?AM/)
  expect(nextStartBoundary([future, past], now).toISOString()).toBe('2026-09-20T09:05:00.000Z')
})

it('rejects unusable successful schedules and orders date groups while preserving row order', async () => {
  await invalid(getEvent(async () => ({ event: event({ timezone: 'Nope' }) }), 2, 8))
  await invalid(getEvent(async () => ({ event: event({ startTime: '10:00', endTime: '09:00' }) }), 2, 8))
  await invalid(getEvent(async () => ({ event: event({ date: '2026-03-08', startTime: '02:30' }) }), 2, 8))
  const now = new Date('2026-09-01T00:00:00.000Z')
  const events = [event({ eventId: 3, date: '2026-09-03', timezone: 'UTC' }), event({ eventId: 2, date: '2026-09-02', timezone: 'UTC' }), event({ eventId: 1, date: '2026-08-30', timezone: 'UTC' })]
  const groups = groupEvents(events, now)
  expect(groups.upcoming.map((group) => group.date)).toEqual(['2026-09-02', '2026-09-03'])
  expect(groups.past.map((group) => group.date)).toEqual(['2026-08-30'])
})
