import { instant, nullableText, validId } from './boundary.js'
import { invalidApiResponse } from './errors.js'

const VALID_PLANS = new Set(['free', 'paid'])

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

export function normalizeCurrentUser(user) {
  const valid =
    user !== null &&
    typeof user === 'object' &&
    Number.isSafeInteger(user.user_id) &&
    user.user_id > 0 &&
    isNonEmptyString(user.username) &&
    isNonEmptyString(user.first_name) &&
    isNonEmptyString(user.last_name) &&
    isNonEmptyString(user.email) &&
    VALID_PLANS.has(user.plan) &&
    typeof user.is_active === 'boolean' &&
    isNonEmptyString(user.created_at) && validId(user.version) &&
    (user.email_verified_at === null || instant(user.email_verified_at)) && nullableText(user.pending_email)

  if (!valid) {
    throw invalidApiResponse(null)
  }

  return {
    userId: user.user_id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    plan: user.plan,
    isActive: user.is_active,
    createdAt: user.created_at,
    version: user.version,
    emailVerifiedAt: user.email_verified_at,
    pendingEmail: user.pending_email,
  }
}
