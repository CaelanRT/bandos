import { check, collection, requireIds, pick, position, mutationOptions, message } from '../../api/boundary.js'
import { invalidApiResponse } from '../../api/errors.js'

const validId = (value) => Number.isSafeInteger(value) && value > 0
const text = (value) => typeof value === 'string' && value.trim().length > 0
const role = (value) => value === 'leader' || value === 'member'

export function parseBandId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && validId(Number(value)) ? Number(value) : null
}

function summary(value) {
  if (!value || !validId(value.bandId) || !text(value.name) || !validId(value.version) ||
      value.isActive !== true || typeof value.createdAt !== 'string' || !role(value.currentUserRole)) {
    throw invalidApiResponse(200)
  }
  return { version: value.version, bandId: value.bandId, name: value.name, isActive: value.isActive,
    createdAt: value.createdAt, currentUserRole: value.currentUserRole }
}

export async function getBands(request, signal) {
  const data = await request('/bands', { signal, expectedStatus: 200 })
  if (!Array.isArray(data?.bands)) throw invalidApiResponse(200)
  const bands = data.bands.map(summary)
  if (new Set(bands.map((band) => band.bandId)).size !== bands.length) throw invalidApiResponse(200)
  return bands
}

export async function getBand(request, bandId, signal) {
  requireIds(bandId)
  const data = await request(`/bands/${bandId}`, { signal, expectedStatus: 200 })
  const band = fullBand(data?.band)
  if (band.bandId !== bandId) throw invalidApiResponse(200)
  return band
}

export function fullBand(value) {
  const band = summary(value)
  if (!Array.isArray(value.members)) throw invalidApiResponse(200)
  const members = value.members.map(parseMember)
  if (new Set(members.map((member) => member.userId)).size !== members.length) throw invalidApiResponse(200)
  const instruments = collection(value.instruments, parseInstrument, 'instrumentId')
  const instrumentation = collection(value.instrumentation, parseTemplateSlot, 'slotId')
  const defaultLineup = parseDefault(value.defaultLineup)
  return { ...band, members, instruments, instrumentation, defaultLineup }
}

const names = new Intl.Collator('en', { sensitivity: 'base' })
export function sortBands(bands) {
  return [...bands].sort((a, b) => names.compare(a.name, b.name) || a.bandId - b.bandId)
}

export function memberFullName(member) {
  return `${member.firstName} ${member.lastName}`
}

export function sortMembers(members) {
  return [...members].sort((a, b) =>
    Number(b.role === 'leader') - Number(a.role === 'leader') ||
    names.compare(memberFullName(a), memberFullName(b)) ||
    names.compare(a.username, b.username) || a.userId - b.userId)
}

export async function createBand(request, input, userId, signal, options) {
  const value = typeof input === 'string' ? { name: input } : input
  const body = pick(value, ['name', 'leaderInstrumentIds'])
  if (value.instrumentation !== undefined) body.instrumentation = value.instrumentation.map(slot => pick(slot, ['instrumentId', 'instrumentName', 'label']))
  const data = await request('/bands', { method: 'POST', body, ...mutationOptions(signal, options), expectedStatus: 201 })
  const band = fullBand(data?.band)
  if (band.currentUserRole !== 'leader' || !band.members.some((member) =>
    member.userId === userId && member.role === 'leader')) throw invalidApiResponse(201)
  return band
}

function parseMember(member) {
  if (!member || !validId(member.userId) || !text(member.username) ||
      !text(member.firstName) || !text(member.lastName) || !role(member.role) ||
      !Array.isArray(member.instrumentIds) || !member.instrumentIds.every(validId)) throw invalidApiResponse(200)
  return { userId: member.userId, username: member.username, firstName: member.firstName,
    lastName: member.lastName, role: member.role, instrumentIds: [...member.instrumentIds] }
}

export async function addBandMember(request, bandId, input, signal, options) {
  requireIds(bandId)
  const value = typeof input === 'string' ? { username: input } : input
  const { username } = value
  const data = await request(`/bands/${bandId}/members`, {
    method: 'POST', body: pick(value, ['username', 'instrumentIds', 'expectedVersion']), ...mutationOptions(signal, options), expectedStatus: 201,
  })
  const member = parseMember(data?.member)
  const band = fullBand(data?.band)
  check(band.bandId === bandId)
  if (member.username.toLowerCase() !== username.toLowerCase()) throw invalidApiResponse(201)
  return member
}

export async function renameBand(request, bandId, input, signal, options) {
  requireIds(bandId)
  const value = typeof input === 'string' ? { name: input } : input
  const { name } = value
  const data = await request(`/bands/${bandId}`, {
    method: 'PATCH', body: pick(value, ['name', 'expectedVersion']), ...mutationOptions(signal, options), expectedStatus: 200,
  })
  const band = fullBand(data?.band)
  if (band.bandId !== bandId || band.name !== name) throw invalidApiResponse(200)
  return band
}

export async function deleteBand(request, bandId, signal, options = {}) {
  requireIds(bandId)
  const data = await request(`/bands/${bandId}`, { method: 'DELETE', body: options.expectedVersion === undefined ? undefined : pick(options, ['expectedVersion']),
    ...mutationOptions(signal, options), expectedStatus: 200 })
  message(data, 'Band deleted')
}

export function parseInstrument(value) {
  check(value && validId(value.instrumentId) && text(value.name))
  return pick(value, ['instrumentId', 'name'])
}
function parseTemplateSlot(value) {
  check(value && validId(value.slotId) && validId(value.instrumentId) && text(value.label) && position(value.position))
  return pick(value, ['slotId', 'instrumentId', 'label', 'position'])
}
function parseDefault(value) {
  if (value === null) return null
  check(value && validId(value.version) && typeof value.isApplicable === 'boolean' && Array.isArray(value.invalidReasons))
  const assignments = collection(value.assignments, row => {
    check(row && validId(row.slotId) && validId(row.userId))
    return pick(row, ['slotId', 'userId'])
  }, 'slotId')
  const invalidReasons = value.invalidReasons.map(reason => {
    check(reason && ['MISSING_SLOT', 'MEMBER_UNAVAILABLE', 'INSTRUMENT_INELIGIBLE'].includes(reason.code) &&
      validId(reason.slotId) && (reason.code === 'MISSING_SLOT' || validId(reason.userId)))
    return pick(reason, ['code', 'slotId', 'userId'])
  })
  return { version: value.version, assignments, isApplicable: value.isApplicable, invalidReasons }
}
export async function getInstruments(request, signal) {
  const data = await request('/instruments', { signal, expectedStatus: 200 })
  return collection(data?.instruments, parseInstrument, 'instrumentId')
}
async function changeBand(request, bandId, path, method, body, signal, options) {
  requireIds(bandId)
  const data = await request(`/bands/${bandId}${path}`, { method, body, ...mutationOptions(signal, options), expectedStatus: 200 })
  const band = fullBand(data?.band)
  check(band.bandId === bandId)
  return band
}
export function removeBandMember(request, bandId, userId, input, signal, options) {
  requireIds(userId)
  return changeBand(request, bandId, `/members/${userId}`, 'DELETE', pick(input, ['expectedVersion']), signal, options)
}
export function clearDefaultLineup(request, bandId, input, signal, options) {
  return changeBand(request, bandId, '/default-lineup', 'DELETE', pick(input, ['expectedVersion']), signal, options)
}
export function saveDefaultLineup(request, bandId, input, signal, options) {
  return changeBand(request, bandId, '/default-lineup', 'PUT', {
    expectedVersion: input.expectedVersion, assignments: input.assignments.map(row => pick(row, ['slotId', 'userId'])),
  }, signal, options)
}
export function updateInstrumentation(request, bandId, input, signal, options) {
  return changeBand(request, bandId, '/instrumentation', 'PATCH', {
    expectedVersion: input.expectedVersion,
    slots: input.slots.map(slot => pick(slot, ['slotId', 'instrumentId', 'label'])),
  }, signal, options)
}
export function transferOwnership(request, bandId, input, signal, options) {
  return changeBand(request, bandId, '/ownership', 'POST', pick(input, ['expectedVersion', 'userId']), signal, options)
}
export async function updateBandMember(request, bandId, userId, input, signal, options) {
  requireIds(bandId, userId)
  const data = await request(`/bands/${bandId}/members/${userId}`, { method: 'PATCH',
    body: pick(input, ['instrumentIds', 'expectedVersion']), ...mutationOptions(signal, options), expectedStatus: 200 })
  const band = fullBand(data?.band)
  const member = parseMember(data?.member)
  check(band.bandId === bandId && member.userId === userId)
  return { band, member }
}
export async function addInstrument(request, bandId, input, signal, options) {
  requireIds(bandId)
  const data = await request(`/bands/${bandId}/instruments`, { method: 'POST',
    body: pick(input, ['name', 'expectedVersion']), ...mutationOptions(signal, options), expectedStatus: 201 })
  const band = fullBand(data?.band)
  const instrument = parseInstrument(data?.instrument)
  check(band.bandId === bandId)
  return { band, instrument }
}
