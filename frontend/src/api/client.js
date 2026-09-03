import { getApiBaseUrl } from '../config.js'
import {
  ApiError,
  invalidApiResponse,
  NETWORK_ERROR,
} from './errors.js'

function buildRequestUrl(baseUrl, path) {
  if (typeof path !== 'string') {
    throw new TypeError('API request path must be a string.')
  }

  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined
  }

  const trimmed = value.trim()
  let deadline

  if (/^\d+$/.test(trimmed)) {
    deadline = now + Number(trimmed) * 1000
  } else {
    deadline = Date.parse(trimmed)
  }

  return Number.isFinite(deadline) && deadline > now ? deadline : undefined
}

function isFieldDetail(detail) {
  return (
    detail !== null &&
    typeof detail === 'object' &&
    typeof detail.field === 'string' &&
    typeof detail.message === 'string'
  )
}

function parseBackendError(payload, status, retryAt) {
  const error = payload?.error
  const hasValidDetails =
    error?.details === undefined ||
    (Array.isArray(error.details) && error.details.every(isFieldDetail))

  if (
    error === null ||
    typeof error !== 'object' ||
    typeof error.code !== 'string' ||
    typeof error.message !== 'string' ||
    !hasValidDetails
  ) {
    throw invalidApiResponse(status)
  }

  return new ApiError(error.message, {
    status,
    code: error.code,
    details: error.details,
    retryAt,
  })
}

function parseSuccess(payload, status) {
  if (payload === undefined) {
    return undefined
  }

  if (
    payload !== null &&
    typeof payload === 'object' &&
    Object.hasOwn(payload, 'data')
  ) {
    return payload.data
  }

  if (
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.message === 'string'
  ) {
    return { message: payload.message }
  }

  throw invalidApiResponse(status)
}

async function readJson(response) {
  let body

  try {
    body = await response.text()
  } catch (cause) {
    throw invalidApiResponse(response.status, cause)
  }

  if (body === '') {
    return undefined
  }

  try {
    return JSON.parse(body)
  } catch (cause) {
    throw invalidApiResponse(response.status, cause)
  }
}

export function createApiClient({
  baseUrl = getApiBaseUrl(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required.')
  }

  return {
    async request(path, { method = 'GET', headers, body, signal } = {}) {
      const requestHeaders = new Headers(headers)
      const requestOptions = {
        method,
        headers: requestHeaders,
        credentials: 'include',
        signal,
      }

      if (body !== undefined) {
        requestHeaders.set('Content-Type', 'application/json')
        requestOptions.body = JSON.stringify(body)
      }

      let response

      try {
        response = await fetchImpl(buildRequestUrl(baseUrl, path), requestOptions)
      } catch (cause) {
        throw new ApiError('Unable to reach the Bandos API.', {
          code: NETWORK_ERROR,
          cause,
        })
      }

      const payload = await readJson(response)

      if (!response.ok) {
        throw parseBackendError(
          payload,
          response.status,
          parseRetryAfter(response.headers.get('Retry-After')),
        )
      }

      return parseSuccess(payload, response.status)
    },
  }
}

let sharedClient

export function apiRequest(path, options) {
  sharedClient ??= createApiClient()
  return sharedClient.request(path, options)
}
