import { describe, expect, it } from 'vitest'
import { resolveDestination } from '../app/destination.js'

describe('authentication destination restoration', () => {
  it.each([
    '/',
    '/account',
    '/bands/12',
    '/bands/12/members?view=active#member-9',
    '/bands/12/settings?from=home#name',
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

it('keeps safe poll links and removes credential query data', () => {
  for (const path of ['/bands/12/polls/new', '/bands/12/polls/34', '/bands/12/polls/34/edit']) {
    expect(resolveDestination(`${path}?token=secret&password=hidden&view=grid#answers`)).toBe(`${path}?view=grid#answers`)
  }
  expect(resolveDestination('/account?view=secret123&returnTo=secret#token=secret')).toBe('/account')
})

it.each(['/\\evil.example/account', '/bands/12/polls/%2e%2e', '/bands/12/polls/0',
  '/bands/12/polls/9007199254740992', '/bands/12/polls/34%0a', '/bands/12/polls/%252f'])('rejects unsafe poll or encoded destination %s', path => {
  expect(resolveDestination(path)).toBe('/')
})
