import { describe, expect, it } from 'vitest'
import { resolveDestination } from '../app/destination.js'

describe('authentication destination restoration', () => {
  it.each([
    '/',
    '/account',
    '/bands/12',
    '/bands/12/members?view=active#member-9',
    '/bands/12/events/new?from=datebook',
    '/bands/12/events/34/edit#details',
  ])('accepts the recognized internal destination %s', (destination) => {
    expect(resolveDestination(destination)).toBe(destination)
  })

  it.each([
    undefined,
    null,
    '',
    'account',
    '/login',
    '/register?destination=/account',
    '/unknown',
    '/bands',
    '//example.com/account',
    'https://example.com/account',
    '/account\nhttps://example.com',
    '/bands/%E0%A4%A',
    '/bands/%2F/account',
    '/bands/%2F',
  ])('falls back to root for the unsafe destination %s', (destination) => {
    expect(resolveDestination(destination)).toBe('/')
  })
})
