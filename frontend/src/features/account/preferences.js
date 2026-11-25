import { check, pick, validId } from '../../api/boundary.js'

export const preferenceFields = ['enabled', 'invitations', 'eventUpdates', 'removalsAndCancellations',
  'invitationResponses', 'pollUpdates', 'pollResponses']
export function parsePreferences(value) {
  check(value && validId(value.version) && preferenceFields.every(field => typeof value[field] === 'boolean'))
  return pick(value, ['version', ...preferenceFields])
}
export async function getPreferences(request, signal) {
  const data = await request('/users/me/notification-preferences', { signal, expectedStatus: 200 })
  return parsePreferences(data?.preferences)
}
export async function savePreferences(request, input, signal) {
  const data = await request('/users/me/notification-preferences', { method: 'PUT',
    body: pick(input, ['expectedVersion', ...preferenceFields]), signal, expectedStatus: 200 })
  return parsePreferences(data?.preferences)
}
