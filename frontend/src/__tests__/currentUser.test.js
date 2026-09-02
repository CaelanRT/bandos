import { describe, expect, it } from 'vitest'
import { normalizeCurrentUser } from '../api/currentUser.js'
import { ApiError, INVALID_API_RESPONSE } from '../api/errors.js'

const backendUser = {
  user_id: 42,
  username: 'alex',
  first_name: 'Alex',
  last_name: 'Rivera',
  email: 'alex@example.com',
  plan: 'free',
  is_active: true,
  created_at: '2026-08-30T12:00:00.000Z',
}

describe('current-user normalization', () => {
  it('maps the implemented backend fields to the frontend model explicitly', () => {
    expect(normalizeCurrentUser(backendUser)).toEqual({
      userId: 42,
      username: 'alex',
      firstName: 'Alex',
      lastName: 'Rivera',
      email: 'alex@example.com',
      plan: 'free',
      isActive: true,
      createdAt: '2026-08-30T12:00:00.000Z',
    })
  })

  it.each([
    null,
    {},
    { ...backendUser, user_id: 0 },
    { ...backendUser, first_name: undefined },
    { ...backendUser, plan: 'enterprise' },
    { ...backendUser, is_active: 'true' },
    { ...backendUser, created_at: '' },
  ])('rejects a malformed current-user object', (user) => {
    expect(() => normalizeCurrentUser(user)).toThrow(ApiError)

    try {
      normalizeCurrentUser(user)
    } catch (error) {
      expect(error.code).toBe(INVALID_API_RESPONSE)
      expect(error.message).toBe('The server returned an invalid response.')
    }
  })
})
