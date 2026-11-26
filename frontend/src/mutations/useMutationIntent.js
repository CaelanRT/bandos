import { useRef, useState } from 'react'
import { ApiError } from '../api/errors.js'

export function isKeyedMutation(path, method = 'GET') {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) &&
    (/^\/bands(?:\/|$)/.test(path) || /^\/users\/me(?:\/|$)/.test(path)) &&
    !(method.toUpperCase() === 'PUT' && path === '/users/me/notification-preferences')
}

// A form calls request only after local validation. The serialized snapshot stays
// in memory until the adapter has accepted the response, including its model.
export function useMutationIntent(request) {
  const intent = useRef(null)
  const sending = useRef(false)
  const replay = useRef(false)
  const [state, setState] = useState(null)

  function complete() {
    intent.current = null
    setState(null)
  }

  async function send(path, options = {}) {
    if (!isKeyedMutation(path, options.method)) return request(path, options)
    if (sending.current) throw new ApiError('A save is already pending.', { code: 'INTENT_PENDING' })
    if (intent.current && !replay.current) {
      throw new ApiError('Recover the previous save before submitting changes.', { code: 'INTENT_UNRESOLVED' })
    }
    if (!intent.current) {
      const headers = new Headers(options.headers)
      headers.set('Idempotency-Key', crypto.randomUUID())
      intent.current = { path, options: { ...options, headers: Object.fromEntries(headers),
        body: options.body === undefined ? undefined : JSON.stringify(options.body) } }
    }
    const frozen = intent.current
    sending.current = true
    try {
      return await request(frozen.path, { ...frozen.options, signal: options.signal,
        headers: new Headers(frozen.options.headers),
        body: frozen.options.body === undefined ? undefined : JSON.parse(frozen.options.body) })
    } finally {
      sending.current = false
    }
  }

  function handleError(error) {
    if (error.code === 'INTENT_PENDING') return true
    if (!intent.current) return false
    if (error.code === 'STALE_VERSION') { setState('stale'); return true }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') { setState('mismatch'); return true }
    if (['REQUEST_IN_PROGRESS', 'INTENT_UNRESOLVED'].includes(error.code) ||
        !error.status || error.status >= 500 || error.code === 'INVALID_API_RESPONSE') {
      setState('uncertain')
      return true
    }
    complete()
    return false
  }

  async function retry(action) {
    if (sending.current || state !== 'uncertain') return
    replay.current = true
    try { await action() } finally { replay.current = false }
  }

  return { request: send, state, unresolved: state === 'uncertain', locked: state !== null, complete, handleError, retry,
    isRetry: () => replay.current }
}
