import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client.js'
import { clearPrivateQueries } from './queryClient.js'
import { getCurrentUser } from '../api/session.js'
import { SessionContext } from './sessionContext.js'

function FullPageStatus({ retry, retryPending }) {
  if (retry === undefined) {
    return (
      <main>
        <p role="status">Loading Bandos…</p>
      </main>
    )
  }

  return (
    <main>
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
  const destinationRef = useRef('/')
  const [session, setSession] = useState({ status: 'checking', user: null })
  const [retryPending, setRetryPending] = useState(false)

  const restore = useCallback(async ({ isRetry = false, destination, afterAuthentication = false } = {}) => {
    if (isRetry) {
      setRetryPending(true)
    }

    if (afterAuthentication && destination !== undefined) {
      destinationRef.current = destination
    }

    try {
      const user = await getCurrentUser()
      statusRef.current = 'authenticated'
      setSession({
        status: 'authenticated',
        user,
        destination: afterAuthentication ? destinationRef.current : null,
        completionError: false,
      })
    } catch (error) {
      if (error?.code === 'AUTHENTICATION_REQUIRED') {
        statusRef.current = 'signedOut'
        clearPrivateQueries(client)
        setSession({
          status: 'signedOut',
          user: null,
          destination: null,
          completionError: afterAuthentication,
        })
      } else {
        statusRef.current = 'failure'
        setSession({
          status: 'failure',
          user: null,
          destination: destinationRef.current,
          completionError: false,
          afterAuthentication,
        })
      }
    } finally {
      if (isRetry) {
        setRetryPending(false)
      }
    }
  }, [client])

  const completeAuthentication = useCallback((destination) => (
    restore({ destination, afterAuthentication: true })
  ), [restore])

  const endSession = useCallback((reason, requestGeneration) => {
    if (statusRef.current !== 'authenticated' || generation.current !== requestGeneration) return
    statusRef.current = 'signedOut'
    generation.current += 1
    clearPrivateQueries(client)
    setSession({ status: 'signedOut', user: null, destination: null, completionError: false, endReason: reason })
  }, [client])

  const acknowledgeEnd = useCallback(() => {
    setSession((current) => ({ ...current, endReason: null }))
  }, [])

  const authenticatedRequest = useCallback(async (path, options) => {
    if (statusRef.current !== 'authenticated') throw new DOMException('Session is no longer active.', 'AbortError')
    const requestGeneration = generation.current
    try {
      const result = await apiRequest(path, options)
      if (generation.current !== requestGeneration) throw new DOMException('Session changed during request.', 'AbortError')
      return result
    } catch (error) {
      if (error?.status === 401 && error.code === 'AUTHENTICATION_REQUIRED') {
        endSession('expired', requestGeneration)
      }
      throw error
    }
  }, [endSession])

  const logOut = useCallback(() => {
    if (logoutPending.current) return logoutPending.current
    if (statusRef.current !== 'authenticated') return Promise.resolve()
    const requestGeneration = generation.current
    // A failed Logout must retain the session, including a rejected 401 response.
    logoutPending.current = apiRequest('/auth/logout', { method: 'POST' })
      .then(() => endSession('loggedOut', requestGeneration))
      .finally(() => { logoutPending.current = null })
    return logoutPending.current
  }, [endSession])

  useEffect(() => {
    if (!started.current) {
      started.current = true
      restore({})
    }
  }, [restore])

  if (session.status === 'checking') {
    return <FullPageStatus />
  }

  if (session.status === 'failure') {
    return (
      <FullPageStatus
        retry={() => restore({
          isRetry: true,
          afterAuthentication: Boolean(session.afterAuthentication),
        })}
        retryPending={retryPending}
      />
    )
  }

  return (
    <SessionContext.Provider value={{
      ...session,
      completeAuthentication,
      authenticatedRequest,
      logOut,
      acknowledgeEnd,
    }}>
      {children}
    </SessionContext.Provider>
  )
}
