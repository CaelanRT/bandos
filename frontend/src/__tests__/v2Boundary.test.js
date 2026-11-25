import { afterEach, expect, it, vi } from 'vitest'
import { createApiClient } from '../api/client.js'
import { normalizeCurrentUser } from '../api/currentUser.js'
import { parseUserSession } from '../api/session.js'
import { login, register } from '../api/auth.js'
import { getBand, getBands, createBand, addBandMember, renameBand, deleteBand, removeBandMember, clearDefaultLineup, saveDefaultLineup, updateInstrumentation, parseBandId } from '../features/bands/api.js'
import { createEvent, updateEvent, deleteEvent, parseEvent, respondToInvitation } from '../features/events/api.js'
import { parsePoll, parsePollSummary, getPoll, getPolls, createPoll, updatePoll, saveAvailability, finalizePoll, cancelPoll, parsePollId } from '../features/polls/api.js'
import { getPreferences, savePreferences, preferenceFields } from '../features/account/preferences.js'
import { deactivateAccount, saveProfile } from '../features/account/profile.js'
import { sessionFixture } from './fixtures/session.js'

const stamp = '2030-09-16T15:05:00.000Z'
const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera', email: 'a@example.com', plan: 'free',
  is_active: true, created_at: stamp, email_verified_at: stamp, pending_email: 'next@example.com', version: 4 }
const person = { userId: 17, username: 'alex', firstName: 'Alex', lastName: 'Rivera' }
const member = { ...person, role: 'leader', instrumentIds: [3] }
const slot = { slotId: 7, templateSlotId: null, instrumentId: 3, instrumentName: 'Guitar', label: 'Lead', position: 0 }
const band = { bandId: 2, version: 4, name: 'Band', isActive: true, createdAt: stamp, currentUserRole: 'leader', members: [member],
  instruments: [{ instrumentId: 3, name: 'Guitar' }], instrumentation: [{ slotId: 7, instrumentId: 3, label: 'Lead', position: 0 }], defaultLineup: null }
const schedule = { date: '2030-09-16', startTime: '15:05', endTime: '16:35' }
const invitation = { ...person, invitationId: 11, status: 'declined', respondedAt: stamp, declineReason: 'Private' }
const event = { eventId: 8, bandId: 2, version: 4, name: 'Practice', type: 'rehearsal', ...schedule, timezone: 'UTC', location: 'Studio', description: null,
  hideFromUninvited: true, startsAt: stamp, endsAt: '2030-09-16T16:35:00.000Z', createdByUserId: 17, isActive: true, createdAt: stamp, updatedAt: stamp,
  slots: [{ ...slot, invitation }], myInvitationId: 11, canManage: true, canRespond: true }
const option = { optionId: 9, revision: 2, ...schedule, startsAt: stamp, endsAt: event.endsAt }
const poll = { pollId: 5, bandId: 2, version: 4, name: 'Practice?', location: 'Studio', description: null, timezone: 'UTC', state: 'open', hideFromUninvited: true,
  slots: [{ ...slot, musician: person }], options: [option], responses: [{ userId: 17, voteVersion: 0, answers: [], needsResponse: true }],
  finalizedEventId: null, createdAt: stamp, updatedAt: stamp, canManage: true, canVote: true }
const preferences = { version: 4, ...Object.fromEntries(preferenceFields.map((key, index) => [key, index % 2 === 0])) }
const invalid = promise => expect(promise).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE' })
const key = '2a1456fc-cfdd-46ba-af31-e4e516ab8fbe'
const intent = { idempotencyKey: key }
const requestFor = data => vi.fn().mockResolvedValue(data)
afterEach(() => vi.unstubAllGlobals())

it('keeps user versions, nullable security fields and session metadata outside the user', () => {
  const result = parseUserSession({ user: { ...user, password_hash: 'excluded' }, session: sessionFixture })
  expect(result.user).toEqual({ userId: 17, username: 'alex', firstName: 'Alex', lastName: 'Rivera', email: 'a@example.com', plan: 'free', isActive: true,
    createdAt: stamp, emailVerifiedAt: stamp, pendingEmail: 'next@example.com', version: 4 })
  expect(result.session).toEqual(sessionFixture)
  expect(normalizeCurrentUser({ ...user, email_verified_at: null, pending_email: null })).toMatchObject({ emailVerifiedAt: null, pendingEmail: null })
  for (const session of [null, { ...sessionFixture, access: 'unknown' }, { ...sessionFixture, idleExpiresAt: null }]) {
    expect(() => parseUserSession({ user, session })).toThrow('invalid response')
  }
})

it('consumes exact auth envelopes/statuses and excludes unsupported confirmation fields', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: { user, session: sessionFixture } }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  expect(await login({ email: 'a@example.com', password: ' unchanged ', confirmation: 'excluded' })).toEqual(parseUserSession({ user, session: sessionFixture }))
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: 'a@example.com', password: ' unchanged ' })
  await invalid(register({ username: 'alex' })) // registration requires 201
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { user, session: sessionFixture } }), { status: 201 }))
  await register({ username: 'alex', firstName: 'Alex', lastName: 'Rivera', email: 'a@example.com', password: 'password', confirmPassword: 'password' })
  expect(JSON.parse(fetch.mock.calls[2][1].body)).not.toHaveProperty('confirmPassword')
})

it('preserves documented structured errors, private reasons and Retry-After', async () => {
  const details = { bands: [{ bandId: 2, name: 'Band' }] }
  for (const error of [
    { code: 'LEADERSHIP_TRANSFER_REQUIRED', message: 'Transfer ownership', details },
    { code: 'AUTHENTICATION_REQUIRED', message: 'Expired', reason: 'idle_expired' },
    { code: 'VALIDATION_ERROR', message: 'Invalid', details: [{ field: 'slots.1.userId', message: 'Ineligible' }] },
  ]) {
    const client = createApiClient({ fetchImpl: async () => new Response(JSON.stringify({ error }), { status: 409, headers: { 'Retry-After': '60' } }) })
    const failure = await client.request('/users/me').catch(value => value)
    expect(failure).toMatchObject(error)
    expect(failure.retryAt).toBeGreaterThan(Date.now())
  }
  for (const details of [{ bands: [{ bandId: '2', name: 'Band' }] }, { bands: null }, { other: [] }]) {
    const client = createApiClient({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'LEADERSHIP_TRANSFER_REQUIRED', message: 'Transfer', details } }), { status: 409 }) })
    await invalid(client.request('/users/me'))
  }
})

it('retains catalog, instrumentation, member eligibility and nullable/repairable defaults', async () => {
  expect(await getBand(requestFor({ band }), 2)).toEqual(band)
  const defaultLineup = { version: 2, assignments: [{ slotId: 7, userId: 17 }], isApplicable: false,
    invalidReasons: [{ code: 'INSTRUMENT_INELIGIBLE', slotId: 7, userId: 17 }, { code: 'MISSING_SLOT', slotId: 8 }] }
  expect(await getBand(requestFor({ band: { ...band, defaultLineup } }), 2)).toEqual({ ...band, defaultLineup })
  const list = await getBands(requestFor({ bands: [band] }))
  expect(list[0]).toMatchObject({ version: 4 })
  expect(list[0]).not.toHaveProperty('members')
  await invalid(getBand(requestFor({ band: { ...band, defaultLineup: {} } }), 2))
  await invalid(getBand(requestFor({ band: { ...band, members: [{ ...member, instrumentIds: [0] }] } }), 2))
})

it('preserves invitation identity, empty slots and conditional private field omission', () => {
  expect(parseEvent(event)).toEqual(event)
  const publicInvitation = { ...invitation }; delete publicInvitation.declineReason
  const parsed = parseEvent({ ...event, slots: [{ ...slot, invitation: publicInvitation }, { ...slot, slotId: 10, invitation: null }] })
  expect(parsed.slots[0].invitation).not.toHaveProperty('declineReason')
  expect(parsed.slots[1].invitation).toBeNull()
  expect(parseEvent({ ...event, slots: [{ ...slot, invitation: { ...invitation, declineReason: null } }] }).slots[0].invitation.declineReason).toBeNull()
  expect(() => parseEvent({ ...event, version: 0 })).toThrow('invalid response')
  expect(() => parseEvent({ ...event, myInvitationId: '11' })).toThrow('invalid response')
})

it('parses poll lists separately from details, including unsaved vote rows and closed snapshots', async () => {
  const summary = { pollId: 5, name: 'Practice?', state: 'open', hideFromUninvited: true, finalizedEventId: null, updatedAt: stamp }
  expect(parsePollSummary(summary)).toEqual(summary)
  expect(await getPolls(requestFor({ polls: [summary] }), 2)).toEqual([summary])
  expect(parsePoll(poll)).toEqual(poll)
  const saved = { ...poll, responses: [{ userId: 17, voteVersion: 1, needsResponse: false, answers: [{ optionId: 9, optionRevision: 2, answer: 'no' }] }] }
  expect(await getPoll(requestFor({ poll: saved }), 2, 5)).toEqual(saved)
  expect(parsePoll({ ...saved, state: 'finalized', finalizedEventId: 8, canVote: false })).toMatchObject({ finalizedEventId: 8 })
  expect(() => parsePoll(summary)).toThrow('invalid response')
  expect(() => parsePoll({ ...poll, responses: [{ ...poll.responses[0], voteVersion: -1 }] })).toThrow('invalid response')
  await invalid(getPoll(requestFor({ poll: { ...poll, bandId: 3 } }), 2, 5))
})

it('rejects noncanonical route IDs and invalid request IDs before making a request', async () => {
  for (const value of ['0', '01', '-1', '1e2', '9007199254740992', 1, null, undefined]) {
    expect(parseBandId(value)).toBeNull(); expect(parsePollId(value)).toBeNull()
  }
  const request = requestFor({ band, poll })
  for (const value of [0, -1, '2', Number.MAX_SAFE_INTEGER + 1]) {
    await invalid(getBand(request, value)); await invalid(getPoll(request, 2, value))
  }
  expect(request).not.toHaveBeenCalled()
})

it('uses exact event composition/response bodies without read-only fields or invitations', async () => {
  const request = requestFor({ event })
  const input = { ...event, templateVersion: 4, expectedVersion: 4, slots: [{ ...event.slots[0], userId: 17 }], confirmation: true }
  await createEvent(request, 2, input, undefined, intent)
  expect(request).toHaveBeenLastCalledWith('/bands/2/events', expect.objectContaining({ method: 'POST', expectedStatus: 201, headers: { 'Idempotency-Key': key }, body: {
    name: 'Practice', type: 'rehearsal', ...schedule, timezone: 'UTC', location: 'Studio', description: null, hideFromUninvited: true,
    templateVersion: 4, slots: [{ slotId: 7, templateSlotId: null, instrumentId: 3, label: 'Lead', userId: 17 }],
  } }))
  await updateEvent(request, 2, 8, { expectedVersion: 4, name: 'Changed', eventId: 8 })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4, name: 'Changed' })
  await respondToInvitation(request, 2, 8, 11, { expectedVersion: 4, status: 'declined', declineReason: 'Private', invitation })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4, status: 'declined', declineReason: 'Private' })
})

it('keeps composition options separate from availability and finalization revisions', async () => {
  const request = requestFor({ poll })
  await createPoll(request, 2, { ...poll, templateVersion: 4, slots: [{ ...slot, userId: 17 }], options: [option] }, undefined, intent)
  expect(request.mock.lastCall[1]).toMatchObject({ method: 'POST', expectedStatus: 201, headers: { 'Idempotency-Key': key } })
  expect(request.mock.lastCall[1].body.options).toEqual([{ optionId: 9, ...schedule }])
  expect(request.mock.lastCall[1].body).not.toHaveProperty('state')
  const clientKey = key
  await updatePoll(request, 2, 5, { expectedVersion: 4, options: [{ ...schedule, clientKey, revision: 1 }] })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4, options: [{ ...schedule, clientKey }] })
  await saveAvailability(request, 2, 5, { expectedVersion: 4, expectedVoteVersion: 0, answers: [{ optionId: 9, optionRevision: 2, answer: 'yes', startsAt: stamp }] })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4, expectedVoteVersion: 0, answers: [{ optionId: 9, optionRevision: 2, answer: 'yes' }] })
  await cancelPoll(request, 2, 5, { expectedVersion: 4, state: 'cancelled' })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4 })
  request.mockResolvedValueOnce({ poll: { ...poll, state: 'finalized', finalizedEventId: 8 }, event })
  expect(await finalizePoll(request, 2, 5, { expectedVersion: 4, optionId: 9, optionRevision: 2, options: [] })).toMatchObject({ event, poll: { finalizedEventId: 8 } })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4, optionId: 9, optionRevision: 2 })
})

it('round-trips all seven preferences with their independent version and no idempotency key', async () => {
  const request = requestFor({ preferences })
  expect(await getPreferences(request)).toEqual(preferences)
  expect(await savePreferences(request, { ...preferences, expectedVersion: 4, userVersion: 99 })).toEqual(preferences)
  expect(request.mock.lastCall[1]).toEqual({ method: 'PUT', expectedStatus: 200, signal: undefined,
    body: { expectedVersion: 4, ...Object.fromEntries(preferenceFields.map(field => [field, preferences[field]])) } })
  for (const value of [{ ...preferences, pollResponses: undefined }, { ...preferences, version: 0 }, null]) {
    await invalid(getPreferences(requestFor({ preferences: value })))
  }
})

it('projects band writes and distinguishes member/default deletion envelopes from resource deletion', async () => {
  const request = requestFor({ band, member })
  await createBand(request, { name: 'Band', instrumentation: [{ instrumentId: 3, label: 'Lead', position: 0 }], leaderInstrumentIds: [3], members: [] }, 17)
  expect(request.mock.lastCall[1].body).toEqual({ name: 'Band', instrumentation: [{ instrumentId: 3, label: 'Lead' }], leaderInstrumentIds: [3] })
  await addBandMember(request, 2, { username: 'alex', expectedVersion: 4, instrumentIds: [3], role: 'leader' })
  expect(request.mock.lastCall[1].body).toEqual({ username: 'alex', expectedVersion: 4, instrumentIds: [3] })
  await renameBand(request, 2, { name: 'Band', expectedVersion: 4, version: 4 })
  expect(request.mock.lastCall[1].body).toEqual({ name: 'Band', expectedVersion: 4 })
  await updateInstrumentation(request, 2, { expectedVersion: 4, slots: [{ ...slot, clientKey: key }] })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4, slots: [{ slotId: 7, instrumentId: 3, label: 'Lead' }] })
  await saveDefaultLineup(request, 2, { expectedVersion: 4, assignments: [{ slotId: 7, userId: 17, username: 'alex' }] })
  expect(request.mock.lastCall[1].body).toEqual({ expectedVersion: 4, assignments: [{ slotId: 7, userId: 17 }] })
  expect(await removeBandMember(request, 2, 17, { expectedVersion: 4 })).toEqual(band)
  expect(await clearDefaultLineup(request, 2, { expectedVersion: 4 })).toEqual(band)
  await invalid(removeBandMember(requestFor({ message: 'Deleted' }), 2, 17, { expectedVersion: 4 }))
  await invalid(clearDefaultLineup(requestFor({ message: 'Deleted' }), 2, { expectedVersion: 4 }))
  for (const [remove, expected] of [
    [req => deleteBand(req, 2, undefined, { expectedVersion: 4, ...intent }), 'Band deleted'],
    [req => deleteEvent(req, 2, 8, undefined, { expectedVersion: 4, ...intent }), 'Event deleted'],
    [req => deactivateAccount(req, { expectedVersion: 4, password: 'exact', confirmPassword: 'excluded' }, undefined, intent), 'Account deactivated'],
  ]) {
    const req = requestFor({ message: expected })
    await remove(req)
    expect(req.mock.lastCall[1]).toMatchObject({ method: 'DELETE', expectedStatus: 200, body: { expectedVersion: 4 }, headers: { 'Idempotency-Key': key } })
    await invalid(remove(requestFor({ band })))
  }
  const profileRequest = requestFor({ user })
  await saveProfile(profileRequest, { expectedVersion: 4, firstName: 'Alex', email: 'excluded', password: 'excluded' }, 17)
  expect(profileRequest.mock.lastCall[1].body).toEqual({ expectedVersion: 4, firstName: 'Alex' })
})
