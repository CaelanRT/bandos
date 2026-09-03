import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/errors.js'

const NON_RETRYABLE_CODES = new Set([
  'AUTHENTICATION_REQUIRED',
  'LEADER_REQUIRED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'BAND_NOT_FOUND',
  'EVENT_NOT_FOUND',
  'TOO_MANY_ATTEMPTS',
])

export function shouldRetryQuery(failureCount, error) {
  if (failureCount >= 1) {
    return false
  }

  if (!(error instanceof ApiError)) {
    return true
  }

  if (NON_RETRYABLE_CODES.has(error.code)) {
    return false
  }

  if (error.status !== null && error.status >= 400 && error.status < 500) {
    return false
  }

  return true
}

export function createBandosQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export function clearPrivateQueries(client) {
  client.removeQueries({
    predicate: (query) => query.queryKey[0] === 'private',
  })
}

export const queryClient = createBandosQueryClient()
