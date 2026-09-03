import { describe, expect, it } from 'vitest'
import { ApiError, NETWORK_ERROR } from '../api/errors.js'
import {
  clearPrivateQueries,
  createBandosQueryClient,
  queryClient,
  shouldRetryQuery,
} from '../app/queryClient.js'

describe('query retry policy', () => {
  it('retries a potentially transient failure only once', () => {
    const error = new ApiError('Unavailable', {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    })

    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(false)
    expect(shouldRetryQuery(2, error)).toBe(false)
  })

  it('retries a controlled network failure once', () => {
    const error = new ApiError('Unable to reach the Bandos API.', {
      code: NETWORK_ERROR,
    })

    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(false)
  })

  it.each([
    [400, 'VALIDATION_ERROR'],
    [401, 'AUTHENTICATION_REQUIRED'],
    [403, 'LEADER_REQUIRED'],
    [404, 'NOT_FOUND'],
    [404, 'BAND_NOT_FOUND'],
    [404, 'EVENT_NOT_FOUND'],
    [429, 'TOO_MANY_ATTEMPTS'],
  ])('does not retry non-retryable %i %s errors', (status, code) => {
    const error = new ApiError('Handled failure', { status, code })

    expect(shouldRetryQuery(0, error)).toBe(false)
  })

  it('does not retry another clearly non-retryable client error', () => {
    const error = new ApiError('Conflict', {
      status: 409,
      code: 'EVENT_ALREADY_STARTED',
    })

    expect(shouldRetryQuery(0, error)).toBe(false)
  })
})

describe('query client defaults', () => {
  const defaults = queryClient.getDefaultOptions()

  it('makes queries immediately stale and disables focus refetching', () => {
    expect(defaults.queries.staleTime).toBe(0)
    expect(defaults.queries.refetchOnWindowFocus).toBe(false)
    expect(defaults.queries.retry).toBe(shouldRetryQuery)
  })

  it('never retries mutations automatically', () => {
    expect(defaults.mutations.retry).toBe(false)
  })
})

describe('private query clearing', () => {
  it('removes private data while retaining public configuration', () => {
    const client = createBandosQueryClient()
    client.setQueryData(['private', 'bands'], [{ bandId: 7 }])
    client.setQueryData(['public', 'configuration'], { plans: ['free'] })

    clearPrivateQueries(client)

    expect(client.getQueryData(['private', 'bands'])).toBeUndefined()
    expect(client.getQueryData(['public', 'configuration'])).toEqual({
      plans: ['free'],
    })
  })
})
