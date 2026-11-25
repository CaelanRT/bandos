import { check, validId, text, nullableId, instant, nullableText, parseSlot, parsePerson, pick, collection, requireIds, compositionBody, mutationOptions, message } from '../../api/boundary.js'
import { invalidApiResponse } from '../../api/errors.js'
import { isLaterSameDay, isRealDate, isSupportedTimezone, isTime, resolveLocalDateTime } from './schedule.js'


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
  check(validId(value.version) && typeof value.hideFromUninvited === 'boolean' &&
    instant(value.startsAt) && instant(value.endsAt) && nullableId(value.myInvitationId) &&
    typeof value.canManage === 'boolean' && typeof value.canRespond === 'boolean', status)
  const slots = collection(value.slots, (slot) => {
    const parsed = parseSlot(slot, status)
    return { ...parsed, invitation: parseInvitation(slot.invitation, status) }
  }, 'slotId', status)
  return { version: value.version, hideFromUninvited: value.hideFromUninvited, startsAt: value.startsAt,
    endsAt: value.endsAt, myInvitationId: value.myInvitationId, canManage: value.canManage,
    canRespond: value.canRespond, slots, eventId: value.eventId, bandId: value.bandId, name: value.name, type: value.type,
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
  requireIds(bandId)
  const data = await request(`/bands/${bandId}/events`, { signal, expectedStatus: 200 })
  if (!Array.isArray(data?.events)) throw invalidApiResponse(200)
  const events = data.events.map((event) => eventForBand(event, bandId, undefined, 200))
  if (new Set(events.map((event) => event.eventId)).size !== events.length) throw invalidApiResponse(200)
  return events
}

export async function getEvent(request, bandId, eventId, signal) {
  requireIds(bandId, eventId)
  const data = await request(`/bands/${bandId}/events/${eventId}`, { signal, expectedStatus: 200 })
  return eventForBand(data?.event, bandId, eventId, 200)
}

export async function createEvent(request, bandId, input, signal, options) {
  requireIds(bandId)
  const body = compositionBody(input, [...eventFields, 'templateVersion'])
  const data = await request(`/bands/${bandId}/events`, { method: 'POST', body, ...mutationOptions(signal, options), expectedStatus: 201 })
  return eventForBand(data?.event, bandId, undefined, 201)
}

export async function updateEvent(request, bandId, eventId, input, signal, options) {
  requireIds(bandId, eventId)
  const body = compositionBody(input, [...eventFields, 'expectedVersion'])
  const data = await request(`/bands/${bandId}/events/${eventId}`, {
    method: 'PATCH', body, ...mutationOptions(signal, options), expectedStatus: 200,
  })
  return eventForBand(data?.event, bandId, eventId, 200)
}

export async function deleteEvent(request, bandId, eventId, signal, options = {}) {
  requireIds(bandId, eventId)
  const data = await request(`/bands/${bandId}/events/${eventId}`, {
    method: 'DELETE', body: options.expectedVersion === undefined ? undefined : pick(options, ['expectedVersion']), ...mutationOptions(signal, options), expectedStatus: 200,
  })
  message(data, 'Event deleted')
}

const eventFields = ['name', 'type', 'date', 'startTime', 'endTime', 'timezone', 'location', 'description', 'hideFromUninvited']
function parseInvitation(value, status) {
  if (value === null) return null
  const person = parsePerson(value, status)
  check(validId(value.invitationId) && ['pending', 'accepted', 'declined'].includes(value.status) &&
    (value.respondedAt === null || instant(value.respondedAt)) &&
    (!Object.hasOwn(value, 'declineReason') || nullableText(value.declineReason)), status)
  return { ...person, ...pick(value, ['invitationId', 'status', 'respondedAt', 'declineReason']) }
}
export async function respondToInvitation(request, bandId, eventId, invitationId, input, signal, options) {
  requireIds(bandId, eventId, invitationId)
  const data = await request(`/bands/${bandId}/events/${eventId}/invitations/${invitationId}/response`, {
    method: 'PUT', body: pick(input, ['expectedVersion', 'status', 'declineReason']),
    ...mutationOptions(signal, options), expectedStatus: 200,
  })
  return eventForBand(data?.event, bandId, eventId, 200)
}
