import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { confirmEmailChange } from '../../api/auth.js'
import { getCurrentUser } from '../../api/session.js'
import { useSession } from '../../app/sessionContext.js'
import { LogoutButton } from './LogoutButton.jsx'

export function VerifyEmailChange() {
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [token, setToken] = useState(() => new URLSearchParams(location.search).get('token') || '')
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [preservedUser, setPreservedUser] = useState(null)
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const busy = useRef(false)
  const lifetime = useRef(null)
  const notice = useRef(null)

  useLayoutEffect(() => {
    if (location.search || location.hash) navigate('/verify-email-change', { replace: true })
  }, [location.search, location.hash, navigate])

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (error || feedback) notice.current?.focus()
  }, [error, feedback])

  useEffect(() => {
    if (!retryAt) return
    const timer = setTimeout(() => setRetryAt(null), Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [retryAt])

  async function run(action) {
    if (busy.current || (retryAt && Date.now() < retryAt)) return
    busy.current = true
    setPending(true)
    setError('')
    setFeedback('')
    try {
      await action()
    } finally {
      busy.current = false
      if (!lifetime.current?.signal.aborted) setPending(false)
    }
  }

  function throttle(failure) {
    setRetryAt(failure.retryAt || null)
    setError(failure.retryAt
      ? `Too many attempts. Try again after ${new Date(failure.retryAt).toLocaleTimeString()}.`
      : 'Too many attempts. Please wait before trying again.')
  }

  function confirm() {
    if (!token) return
    return run(async () => {
      const signal = lifetime.current.signal
      try {
        await confirmEmailChange(token, signal)
        if (signal.aborted) return
        setToken('')
        if (!session.user) {
          navigate('/login', { replace: true, state: { notice: 'emailChanged', requireLogin: true } })
          return
        }
        try {
          const checked = await getCurrentUser()
          if (signal.aborted) return
          setConfirmed(true)
          setPreservedUser(checked.user)
          setSessionCheckFailed(false)
          setFeedback(`Email address updated. All devices for that account were signed out. Log in with the new email address to use it. You remain signed in as @${checked.user.username}.`)
        } catch (checkError) {
          if (signal.aborted) return
          if (checkError?.code === 'AUTHENTICATION_REQUIRED') {
            session.finishPasswordUpdate('emailChanged')
            navigate('/login', { replace: true, state: { notice: 'emailChanged', requireLogin: true } })
          } else {
            setConfirmed(true)
            setSessionCheckFailed(true)
            setFeedback('Email address updated. All devices for the updated account were signed out. Log in with the new email address. We couldn’t verify whether your current browser session is still active.')
          }
        }
      } catch (failure) {
        if (signal.aborted || failure.name === 'AbortError') return
        if (failure.code === 'TOO_MANY_ATTEMPTS') {
          throttle(failure)
        } else {
          setToken('')
          if (failure.code === 'ACCOUNT_CONFLICT') {
            setError('That email address is already in use by another account. Your active email address was not changed. Request a different address from Account.')
          } else if (failure.code === 'TOKEN_INVALID_OR_EXPIRED' || failure.code === 'VALIDATION_ERROR') {
            setError('This confirmation link is invalid, expired, or already used. Your active email address was not changed. Open your newest link or request a new change from Account.')
          } else {
            setUncertain(true)
            setError('We couldn’t confirm whether your email address changed. If it already succeeded, all devices for that account were signed out. Check your session or try logging in with the new address; this request will not be retried automatically.')
          }
        }
      }
    })
  }

  function checkSession() {
    return run(async () => {
      const signal = lifetime.current.signal
      try {
        const checked = await getCurrentUser({ activity: true })
        if (signal.aborted) return
        setSessionCheckFailed(false)
        setPreservedUser(checked.user)
        setFeedback(`You are signed in as @${checked.user.username} (${checked.user.email}).`)
      } catch (checkError) {
        if (signal.aborted) return
        if (checkError?.code === 'AUTHENTICATION_REQUIRED') {
          if (session.user) {
            const noticeKey = confirmed ? 'emailChanged' : 'revoked'
            session.finishPasswordUpdate(noticeKey)
            navigate('/login', { replace: true, state: { notice: noticeKey, requireLogin: true } })
          } else {
            setFeedback('No active session was found. Log in with your new email address if the change succeeded, or your previous address if it did not.')
          }
        } else {
          setError('We couldn’t check your session. Try again or go to Login.')
        }
      }
    })
  }

  return <main className="entry-main">
    <meta name="referrer" content="no-referrer" />
    <div className="auth-page">
      <h1>Confirm your email change</h1>
      {(error || feedback) && (
        <div className="auth-notice" ref={notice} tabIndex="-1" role={error ? 'alert' : 'status'}>
          {error || feedback}
        </div>
      )}
      {token && <>
        <p>Confirm to update your email address. All devices for that account will be signed out and will need to log in with the new email address.</p>
        <button type="button" onClick={confirm} disabled={pending || Boolean(retryAt)}>
          {pending ? 'Confirming…' : 'Confirm email change'}
        </button>
      </>}
      {!token && !confirmed && !uncertain && (
        <p>Open your newest email change link to confirm. If you reloaded this page, reopen the link or request a new change from Account.</p>
      )}
      {(uncertain || sessionCheckFailed) && (
        <button type="button" onClick={checkSession} disabled={pending || Boolean(retryAt)}>
          Check session
        </button>
      )}
      {pending && <p role="status">Please wait…</p>}
      <p><Link to="/login" state={{ requireLogin: true }}>Go to Login</Link></p>
      {session.status === 'authenticated' && !confirmed && <p><Link to="/account">Return to Account</Link></p>}
      {preservedUser && <p><Link to="/">Continue as @{preservedUser.username}</Link></p>}
      {session.user && <LogoutButton />}
    </div>
  </main>
}
