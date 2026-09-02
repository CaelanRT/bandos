const API_PREFIX = '/api/v1'

export class ConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

export function buildApiBaseUrl(origin) {
  if (typeof origin !== 'string' || origin.trim() === '') {
    throw new ConfigurationError(
      'VITE_API_ORIGIN is required. Copy .env.example to .env and set the backend origin.',
    )
  }

  return `${origin.trim().replace(/\/+$/, '')}${API_PREFIX}`
}

export function getApiBaseUrl(environment = import.meta.env) {
  return buildApiBaseUrl(environment.VITE_API_ORIGIN)
}
