import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client.js'
import { clearPrivateQueries } from './queryClient.js'
import { resolveDestination } from './destination.js'
import { getCurrentUser } from '../api/session.js'
import { SessionContext } from './sessionContext.js'

function FullPageStatus({ retry, retryPending }) {
  if (retry === undefined) {
    return (
      <main className="entry-status">
        <p role="status">Loading Bandos…</p>
      </main>
    )
  }

  return (
    <main className="entry-status">
      <h1>We couldn’t connect to Bandos</h1>
      <button type="button" disabled={retryPending} onClick={retry}>
        {retryPending ? 'Retrying…' : 'Retry'}
      </button>
    </main>
  )
}

export function SessionBoundary({ children }) {
  const client = useQueryClient()
  const statusRef = useRef('checking')
  const generation = useRef(0)
  const logoutPending = useRef(null)
  const started = useRef(false)
  const [session, setSession] = useState({ status: 'checking', user: null, generation: 0 })
  const [retryPending, setRetryPending] = useState(false)

  const changeGeneration = useCallback(() => {
    generation.current += 1
    logoutPending.current = null
    clearPrivateQueries(client)
    return generation.current
  }, [client])

  const acceptSession = useCallback((result, destination = null) => {
    const nextGeneration = changeGeneration()
    const status = result.session.access === 'full' ? 'authenticated' : 'verification_required'
    statusRef.current = status
    setSession({ ...result, generation: nextGeneration, status, destination: destination === null ? null : resolveDestination(destination), completionError: false })
  }, [changeGeneration])

  const restore = useCallback(async ({ isRetry = false } = {}) => {
    const requestGeneration = changeGeneration()
    if (isRetry) setRetryPending(true)
    try {
      const result = await getCurrentUser()
      if (requestGeneration !== generation.current) return
      acceptSession(result)
    } catch (error) {
      if (requestGeneration !== generation.current) return
      const status = error?.code === 'AUTHENTICATION_REQUIRED' ? 'signedOut' : 'failure'
      statusRef.current = status
      setSession({ status, user: null, generation: requestGeneration })
    } finally {
      if (isRetry) setRetryPending(false)
    }
  }, [changeGeneration, acceptSession])

  const completeAuthentication = useCallback((destination, result) => {
    // Auth responses already carry the authoritative access and deadlines.
    acceptSession(result, destination)
  }, [acceptSession])

  const endSession = useCallback((reason, requestGeneration, expiryReason) => {
    if (!['authenticated', 'verification_required'].includes(statusRef.current) || generation.current !== requestGeneration) return
    statusRef.current = 'signedOut'
    const nextGeneration = changeGeneration()
    setSession({ generation: nextGeneration, status: 'signedOut', user: null, endReason: reason, expiryReason })
  }, [changeGeneration])

  const acknowledgeEnd = useCallback(() => {
    setSession((current) => ({ ...current, endReason: null, expiryReason: null }))
  }, [])

  const activeGeneration = session.generation
  const authenticatedRequest = useCallback(async (path, options) => {
    if (statusRef.current !== 'authenticated' || activeGeneration !== generation.current) throw new DOMException('Session is no longer active.', 'AbortError')
    const requestGeneration = generation.current
    try {
      const result = await apiRequest(path, options)
      if (generation.current !== requestGeneration) throw new DOMException('Session changed during request.', 'AbortError')
      return result
    } catch (error) {
      if (generation.current !== requestGeneration) throw new DOMException('Session changed during request.', 'AbortError')
      if (error?.status === 401 && error.code === 'AUTHENTICATION_REQUIRED') {
        endSession('expired', requestGeneration, error.reason)
      } else if (error?.code === 'EMAIL_VERIFICATION_REQUIRED') {
        statusRef.current = 'verification_required'
        const nextGeneration = changeGeneration()
        setSession((current) => ({ ...current, generation: nextGeneration, status: 'verification_required',
          session: { ...current.session, access: 'verification_required' } }))
      }
      throw error
    }
  }, [endSession, changeGeneration, activeGeneration])

  const logOut = useCallback(() => {
    if (logoutPending.current) return logoutPending.current
    if (!['authenticated', 'verification_required'].includes(statusRef.current)) return Promise.resolve()
    const requestGeneration = generation.current
    logoutPending.current = apiRequest('/auth/logout', { method: 'POST' })
      .then(() => endSession('loggedOut', requestGeneration))
      .finally(() => { if (generation.current === requestGeneration) logoutPending.current = null })
    return logoutPending.current
  }, [endSession])

  const updateCurrentUser = useCallback((user) => {
    if (statusRef.current !== 'authenticated') return
    setSession((current) => current.status === 'authenticated' && current.user.userId === user.userId
      ? { ...current, user } : current)
  }, [])

  const finishDeactivation = useCallback(() => {
    endSession('deactivated', generation.current)
  }, [endSession])

  useEffect(() => {
    if (!started.current) {
      started.current = true
      restore()
    }
  }, [restore])

  if (session.status === 'checking') return <FullPageStatus />
  if (session.status === 'failure') {
    return <FullPageStatus retry={() => restore({ isRetry: true })} retryPending={retryPending} />
  }

  return (
    <SessionContext.Provider value={{
      ...session, completeAuthentication, authenticatedRequest, updateCurrentUser,
      finishDeactivation, logOut, acknowledgeEnd,
    }}>
      <SessionGeneration key={session.generation}>{children}</SessionGeneration>
    </SessionContext.Provider>
  )
}

// Remount forms and token screens on every identity/access generation change.
function SessionGeneration({ children }) {
  return children
}
