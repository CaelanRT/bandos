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
  const band = summary(data?.band)
  if (band.bandId !== bandId || !Array.isArray(data.band.members)) throw invalidApiResponse(200)
  const members = data.band.members.map((member) => {
    if (!member || !validId(member.userId) || !text(member.username) ||
        !text(member.firstName) || !text(member.lastName) || !role(member.role)) throw invalidApiResponse(200)
    return { userId: member.userId, username: member.username, firstName: member.firstName,
      lastName: member.lastName, role: member.role }
  })
  if (new Set(members.map((member) => member.userId)).size !== members.length) throw invalidApiResponse(200)
  return { ...band, members }
}

const names = new Intl.Collator('en', { sensitivity: 'base' })
export function sortBands(bands) {
  return [...bands].sort((a, b) => names.compare(a.name, b.name) || a.bandId - b.bandId)
}
