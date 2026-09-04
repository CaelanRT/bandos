import { describe, expect, it } from 'vitest'
import { normalizeRegistration, validateRegistration } from '../features/auth/registrationValidation.js'

const valid = { firstName: 'Alex', lastName: 'Rivera', username: 'alex', email: 'alex@example.com', password: 'password' }

describe('registration validation', () => {
  it.each([
    ['firstName', '', false], ['firstName', '   ', false], ['firstName', 'a', true],
    ['firstName', 'a'.repeat(50), true], ['firstName', 'a'.repeat(51), false],
    ['lastName', '', false], ['lastName', 'a', true], ['lastName', 'a'.repeat(50), true], ['lastName', 'a'.repeat(51), false],
    ['username', ' ab ', false], ['username', ' abc ', true], ['username', 'a'.repeat(50), true], ['username', 'a'.repeat(51), false],
    ['email', '', false], ['email', 'invalid', false], ['email', ' a@example.com ', true],
    ['email', 'a'.repeat(242) + '@example.com', true], ['email', 'a'.repeat(243) + '@example.com', false],
    ['password', '', false], ['password', 'a'.repeat(7), false], ['password', '        ', true],
    ['password', 'a'.repeat(72), true], ['password', 'a'.repeat(73), false],
    ['password', '😀'.repeat(36), true], ['password', '😀'.repeat(37), false],
  ])('%s validates length and format for %j', (field, value, accepted) => {
    expect(validateRegistration({ ...valid, [field]: value })[field] === undefined).toBe(accepted)
  })

  it('trims before checking limits and submits only recognized fields, preserving password', () => {
    const values = { firstName: ' ' + 'a'.repeat(50) + ' ', lastName: ' Rivera ', username: ' alex ', email: ' A@Example.COM ', password: ' secret ', extra: 'ignored' }
    expect(validateRegistration(values)).toEqual({})
    expect(normalizeRegistration(values)).toEqual({ firstName: 'a'.repeat(50), lastName: 'Rivera', username: 'alex', email: 'a@example.com', password: ' secret ' })
  })
})
