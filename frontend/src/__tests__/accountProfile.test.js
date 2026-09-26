import { describe, expect, it } from 'vitest'
import { changedProfile, normalizeProfile, validateProfile } from '../features/account/profile.js'

const user = { firstName: 'Alex', lastName: 'Rivera', username: 'alex' }

describe('profile edits', () => {
  it('trims fields before validation and submits only changed fields', () => {
    const values = { firstName: ' Alex ', lastName: 'Rivera', username: ' new-name ' }
    expect(normalizeProfile(values)).toEqual({ firstName: 'Alex', lastName: 'Rivera', username: 'new-name' })
    expect(validateProfile(values)).toEqual({})
    expect(changedProfile(values, user)).toEqual({ username: 'new-name' })
    expect(changedProfile({ firstName: ' Alex ', lastName: ' Rivera ', username: ' alex ' }, user)).toEqual({})
  })

  it('rejects empty, short, and oversized trimmed values', () => {
    expect(validateProfile({ firstName: ' ', lastName: 'A'.repeat(51), username: ' ab ' }))
      .toEqual({ firstName: 'Enter your first name.', lastName: 'Use 50 characters or fewer.',
        username: 'Use at least 3 characters.' })
    expect(validateProfile({ firstName: 'A'.repeat(50), lastName: 'B', username: 'c'.repeat(51) }))
      .toEqual({ username: 'Use 50 characters or fewer.' })
  })
})
