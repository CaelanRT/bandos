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
  const [session, setSession] = useState({ status: 'checking', user: null })
  const [retryPending, setRetryPending] = useState(false)

  const restore = useCallback(async (isRetry = false) => {
    if (isRetry) {
      setRetryPending(true)
    }

    try {
      const user = await getCurrentUser()
      setSession({ status: 'authenticated', user })
    } catch (error) {
      if (error?.code === 'AUTHENTICATION_REQUIRED') {
        setSession({ status: 'signedOut', user: null })
      } else {
        setSession({ status: 'failure', user: null })
      }
    } finally {
      if (isRetry) {
        setRetryPending(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!started.current) {
      started.current = true
      restore()
    }
  }, [restore])

  if (session.status === 'checking') {
    return <FullPageStatus />
  }

  if (session.status === 'failure') {
    return (
      <FullPageStatus
        retry={() => restore(true)}
        retryPending={retryPending}
      />
    )
  }

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  )
}
