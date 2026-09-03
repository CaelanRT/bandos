import { useCallback, useEffect, useRef, useState } from 'react'
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
      setSession({
        status: 'authenticated',
        user,
        destination: afterAuthentication ? destinationRef.current : null,
        completionError: false,
      })
    } catch (error) {
      if (error?.code === 'AUTHENTICATION_REQUIRED') {
        setSession({
          status: 'signedOut',
          user: null,
          destination: null,
          completionError: afterAuthentication,
        })
      } else {
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
  }, [])

  const completeAuthentication = useCallback((destination) => (
    restore({ destination, afterAuthentication: true })
  ), [restore])

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
    }}>
      {children}
    </SessionContext.Provider>
  )
}
