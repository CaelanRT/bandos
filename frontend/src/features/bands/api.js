import { invalidApiResponse } from '../../api/errors.js'

const validId = (value) => Number.isSafeInteger(value) && value > 0
const text = (value) => typeof value === 'string' && value.trim().length > 0
const role = (value) => value === 'leader' || value === 'member'

export function parseBandId(value) {
  return /^[1-9]\d*$/.test(value) && validId(Number(value)) ? Number(value) : null
}

function summary(value) {
  if (!value || !validId(value.bandId) || !text(value.name) ||
      value.isActive !== true || typeof value.createdAt !== 'string' || !role(value.currentUserRole)) {
    throw invalidApiResponse(200)
  }
  return { bandId: value.bandId, name: value.name, isActive: value.isActive,
    createdAt: value.createdAt, currentUserRole: value.currentUserRole }
}

export async function getBands(request, signal) {
  const data = await request('/bands', { signal })
  if (!Array.isArray(data?.bands)) throw invalidApiResponse(200)
  const bands = data.bands.map(summary)
  if (new Set(bands.map((band) => band.bandId)).size !== bands.length) throw invalidApiResponse(200)
  return bands
}

export async function getBand(request, bandId, signal) {
  const data = await request(`/bands/${bandId}`, { signal })
  const band = fullBand(data?.band)
  if (band.bandId !== bandId) throw invalidApiResponse(200)
  return band
}

function fullBand(value) {
  const band = summary(value)
  if (!Array.isArray(value.members)) throw invalidApiResponse(200)
  const members = value.members.map(parseMember)
  if (new Set(members.map((member) => member.userId)).size !== members.length) throw invalidApiResponse(200)
  return { ...band, members }
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

export async function createBand(request, name, userId, signal) {
  const data = await request('/bands', { method: 'POST', body: { name }, signal, expectedStatus: 201 })
  const band = fullBand(data?.band)
  if (band.currentUserRole !== 'leader' || !band.members.some((member) =>
    member.userId === userId && member.role === 'leader')) throw invalidApiResponse(201)
  return band
}

function parseMember(member) {
  if (!member || !validId(member.userId) || !text(member.username) ||
      !text(member.firstName) || !text(member.lastName) || !role(member.role)) throw invalidApiResponse(200)
  return { userId: member.userId, username: member.username, firstName: member.firstName,
    lastName: member.lastName, role: member.role }
}

export async function addBandMember(request, bandId, username, signal) {
  const data = await request(`/bands/${bandId}/members`, {
    method: 'POST', body: { username }, signal, expectedStatus: 201,
  })
  const member = parseMember(data?.member)
  if (member.username.toLowerCase() !== username.toLowerCase()) throw invalidApiResponse(201)
  return member
}
