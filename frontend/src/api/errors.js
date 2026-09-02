export const INVALID_API_RESPONSE = 'INVALID_API_RESPONSE'
export const NETWORK_ERROR = 'NETWORK_ERROR'

export class ApiError extends Error {
  constructor(message, { status = null, code, details, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code

    if (details !== undefined) {
      this.details = details
    }
  }
}

export function invalidApiResponse(status, cause) {
  return new ApiError('The server returned an invalid response.', {
    status,
    code: INVALID_API_RESPONSE,
    cause,
  })
}
