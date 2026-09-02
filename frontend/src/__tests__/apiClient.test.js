import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../api/client.js'
import {
  ApiError,
  INVALID_API_RESPONSE,
  NETWORK_ERROR,
} from '../api/errors.js'

function jsonResponse(payload, init) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('API client', () => {
  it('joins endpoint paths to the configured API base and includes credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }))
    const client = createApiClient({
      baseUrl: 'https://api.example.com/api/v1/',
      fetchImpl,
    })

    await client.request('/bands')

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/api/v1/bands')
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      credentials: 'include',
    })
  })

  it('JSON-encodes a defined body and preserves recognized options', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: { bandId: 7 } }, { status: 201 }),
    )
    const client = createApiClient({ baseUrl: 'https://api.test/api/v1', fetchImpl })
    const signal = new AbortController().signal

    await client.request('bands', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: { name: 'The Examples' },
      signal,
    })

    const options = fetchImpl.mock.calls[0][1]
    expect(options.body).toBe('{"name":"The Examples"}')
    expect(options.headers.get('Content-Type')).toBe('application/json')
    expect(options.headers.get('Accept')).toBe('application/json')
    expect(options.signal).toBe(signal)
  })

  it('does not add a body or content type when the body is undefined', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    const client = createApiClient({ baseUrl: 'https://api.test/api/v1', fetchImpl })

    await client.request('users/me')

    const options = fetchImpl.mock.calls[0][1]
    expect(options.body).toBeUndefined()
    expect(options.headers.has('Content-Type')).toBe(false)
  })

  it('returns data from a standard success envelope', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ data: { bandId: 7 } })),
    })

    await expect(client.request('bands/7')).resolves.toEqual({ bandId: 7 })
  })

  it('returns authentication success messages without inferring identity', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: vi.fn().mockResolvedValue(
        jsonResponse({ message: 'user: 42 logged in' }),
      ),
    })

    await expect(client.request('auth/login')).resolves.toEqual({
      message: 'user: 42 logged in',
    })
  })

  it.each([204, 205])('accepts an empty %i success response', async (status) => {
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status })),
    })

    await expect(client.request('auth/logout')).resolves.toBeUndefined()
  })

  it('normalizes a valid backend error and field details', async () => {
    const details = [{ field: 'email', message: 'Enter a valid email' }]
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details,
            },
          },
          { status: 400 },
        ),
      ),
    })

    const error = await client.request('auth/register').catch((reason) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details,
    })
  })

  it('turns network rejection into a controlled error with a diagnostic cause', async () => {
    const cause = new TypeError('fetch failed')
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: vi.fn().mockRejectedValue(cause),
    })

    const error = await client.request('bands').catch((reason) => reason)

    expect(error).toMatchObject({
      status: null,
      code: NETWORK_ERROR,
      message: 'Unable to reach the Bandos API.',
      cause,
    })
    expect(error.message).not.toContain(cause.message)
  })

  it.each([
    ['invalid JSON', new Response('<html>nope</html>', { status: 200 })],
    ['a malformed success envelope', jsonResponse({ result: {} })],
    [
      'a malformed error envelope',
      jsonResponse({ error: { message: 'Missing code' } }, { status: 500 }),
    ],
    [
      'malformed error details',
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: [{ field: 12, message: 'Invalid' }],
          },
        },
        { status: 400 },
      ),
    ],
  ])('classifies %s as an invalid API response', async (_label, response) => {
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: vi.fn().mockResolvedValue(response),
    })

    const error = await client.request('anything').catch((reason) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(INVALID_API_RESPONSE)
    expect(error.message).toBe('The server returned an invalid response.')
  })
})
