import { describe, expect, it, vi } from 'vitest'
import { createApiClient, parseRetryAfter } from '../api/client.js'

function rateLimitedResponse(retryAfter) {
  return new Response(
    JSON.stringify({
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts' },
    }),
    { status: 429, headers: { 'Retry-After': retryAfter } },
  )
}

describe('Retry-After normalization', () => {
  it('normalizes delay-seconds to an absolute deadline', () => {
    expect(parseRetryAfter('120', Date.parse('2026-09-03T12:00:00Z'))).toBe(
      Date.parse('2026-09-03T12:02:00Z'),
    )
  })

  it('accepts a future HTTP date and rejects invalid or elapsed values', () => {
    const now = Date.parse('2026-09-03T12:00:00Z')

    expect(parseRetryAfter('Thu, 03 Sep 2026 12:02:00 GMT', now)).toBe(
      Date.parse('2026-09-03T12:02:00Z'),
    )
    expect(parseRetryAfter('not-a-date', now)).toBeUndefined()
    expect(parseRetryAfter('Thu, 03 Sep 2026 11:59:00 GMT', now)).toBeUndefined()
  })

  it('places a normalized deadline on API errors without exposing the response', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-09-03T12:00:00Z')
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: vi.fn().mockResolvedValue(rateLimitedResponse('60')),
    })

    const error = await client.request('auth/login').catch((reason) => reason)

    expect(error.retryAt).toBe(Date.parse('2026-09-03T12:01:00Z'))
    expect(error.response).toBeUndefined()
    vi.useRealTimers()
  })
})
