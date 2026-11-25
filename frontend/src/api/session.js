import { apiRequest } from './client.js'
import { normalizeCurrentUser } from './currentUser.js'
import { check, instant, pick } from './boundary.js'

export function parseUserSession(data, status = 200) {
  const session = data?.session
  check(session && ['full', 'verification_required'].includes(session.access) &&
    ['authenticatedAt', 'idleExpiresAt', 'absoluteExpiresAt'].every(key => instant(session[key])), status)
  return { user: normalizeCurrentUser(data?.user),
    session: pick(session, ['access', 'authenticatedAt', 'idleExpiresAt', 'absoluteExpiresAt']) }
}
export async function getCurrentUser() {
  return parseUserSession(await apiRequest('/users/me', { expectedStatus: 200 }))
}
