import { describe, expect, it } from 'vitest'
import {
  buildApiBaseUrl,
  ConfigurationError,
  getApiBaseUrl,
} from '../config.js'

describe('API configuration', () => {
  it.each([
    ['http://localhost:3000', 'http://localhost:3000/api/v1'],
    ['http://localhost:3000/', 'http://localhost:3000/api/v1'],
    ['https://api.example.com///', 'https://api.example.com/api/v1'],
  ])('builds one API boundary from %s', (origin, expected) => {
    expect(buildApiBaseUrl(origin)).toBe(expected)
  })

  it('reads the API origin from an injected environment', () => {
    expect(getApiBaseUrl({ VITE_API_ORIGIN: 'https://api.example.com/' })).toBe(
      'https://api.example.com/api/v1',
    )
  })

  it.each([undefined, null, '', '   '])(
    'rejects a missing API origin (%s)',
    (origin) => {
      expect(() => buildApiBaseUrl(origin)).toThrow(ConfigurationError)
      expect(() => buildApiBaseUrl(origin)).toThrow(/VITE_API_ORIGIN is required/)
    },
  )
})
