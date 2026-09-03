import { describe, expect, it } from 'vitest'
import { normalizeLogin, validateLogin } from '../features/auth/loginValidation.js'

describe('Login credential validation', () => {
  it('reports required credentials', () => {
    expect(validateLogin({ email: '  ', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    })
  })

  it.each(['alex', 'alex@', '@example.com', 'alex @example.com'])(
    'rejects the invalid email %s',
    (email) => {
      expect(validateLogin({ email, password: 'secret' }).email).toBe(
        'Enter a valid email address.',
      )
    },
  )

  it('enforces the credential length limits', () => {
    expect(
      validateLogin({ email: `${'a'.repeat(243)}@example.com`, password: 'x'.repeat(73) }),
    ).toEqual({
      email: 'Use 254 characters or fewer.',
      password: 'Use 72 characters or fewer.',
    })
  })

  it('normalizes only the submitted email', () => {
    expect(
      normalizeLogin({ email: '  Alex@Example.COM ', password: '  secret  ' }),
    ).toEqual({ email: 'alex@example.com', password: '  secret  ' })
  })
})
