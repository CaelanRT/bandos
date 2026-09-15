import { invalidApiResponse } from '../../api/errors.js'
import { isLaterSameDay, isRealDate, isSupportedTimezone, isTime, resolveLocalDateTime } from './schedule.js'

const validId = (value) => Number.isSafeInteger(value) && value > 0
const text = (value) => typeof value === 'string' && value.trim().length > 0

export function parseEventId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && validId(Number(value)) ? Number(value) : null
}

export function parseEvent(value, status = 200) {
  if (!value || !validId(value.eventId) || !validId(value.bandId) || !text(value.name) ||
      !['rehearsal', 'performance'].includes(value.type) || !isRealDate(value.date) ||
      !isTime(value.startTime) || !isTime(value.endTime) || !isLaterSameDay(value.startTime, value.endTime) ||
      !isSupportedTimezone(value.timezone) || resolveLocalDateTime(value.date, value.startTime, value.timezone) === null ||
      !text(value.location) || !(typeof value.description === 'string' || value.description === null) ||
      !validId(value.createdByUserId) || value.isActive !== true ||
      typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') throw invalidApiResponse(status)
  return { eventId: value.eventId, bandId: value.bandId, name: value.name, type: value.type,
    date: value.date, startTime: value.startTime, endTime: value.endTime, timezone: value.timezone,
    location: value.location, description: value.description, createdByUserId: value.createdByUserId,
    isActive: value.isActive, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

function eventForBand(value, bandId, eventId, status) {
  const event = parseEvent(value, status)
  if (event.bandId !== bandId || (eventId !== undefined && event.eventId !== eventId)) throw invalidApiResponse(status)
  return event
}

export async function getEvents(request, bandId, signal) {
  const data = await request(`/bands/${bandId}/events`, { signal })
  if (!Array.isArray(data?.events)) throw invalidApiResponse(200)
  const events = data.events.map((event) => eventForBand(event, bandId, undefined, 200))
  if (new Set(events.map((event) => event.eventId)).size !== events.length) throw invalidApiResponse(200)
  return events
}

export async function getEvent(request, bandId, eventId, signal) {
  const data = await request(`/bands/${bandId}/events/${eventId}`, { signal })
  return eventForBand(data?.event, bandId, eventId, 200)
}

export async function createEvent(request, bandId, body, signal) {
  const data = await request(`/bands/${bandId}/events`, { method: 'POST', body, signal, expectedStatus: 201 })
  return eventForBand(data?.event, bandId, undefined, 201)
}

export async function updateEvent(request, bandId, eventId, body, signal) {
  const data = await request(`/bands/${bandId}/events/${eventId}`, {
    method: 'PATCH', body, signal, expectedStatus: 200,
  })
  return eventForBand(data?.event, bandId, eventId, 200)
}

export async function deleteEvent(request, bandId, eventId, signal) {
  const data = await request(`/bands/${bandId}/events/${eventId}`, {
    method: 'DELETE', signal, expectedStatus: 200,
  })
  if (data?.message !== 'Event deleted') throw invalidApiResponse(200)
}
