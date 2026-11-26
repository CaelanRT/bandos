import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { confirmVerification, resendVerification } from '../../api/auth.js'
import { getCurrentUser } from '../../api/session.js'
import { resolveDestination } from '../../app/destination.js'
import { useSession } from '../../app/sessionContext.js'
import { LogoutButton } from './LogoutButton.jsx'
import { validateLoginField } from './loginValidation.js'

const INVALID_LINK = 'This link is invalid, expired or already used. Reopen your newest verification email or request a replacement.'

export function VerifyEmail() {
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = resolveDestination(location.state?.destination || session.destination)
  const [token, setToken] = useState(() => new URLSearchParams(location.search).get('token') || '')
  const [email, setEmail] = useState(session.user?.email || '')
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const busy = useRef(false)
  const alive = useRef(true)
  const notice = useRef(null)

  useLayoutEffect(() => {
    // Capture only in component memory; replace the credential-bearing history entry.
    if (location.search || location.hash) navigate('/verify-email', { replace: true, state: { destination } })
  }, [location.search, location.hash, destination, navigate])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => { if (error || feedback) notice.current?.focus() }, [error, feedback])
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
    try { await action() }
    finally {
      busy.current = false
      if (alive.current) setPending(false)
    }
  }

  function throttle(error) {
    setRetryAt(error.retryAt || null)
    setError(error.retryAt
      ? `Too many requests. Try again after ${new Date(error.retryAt).toLocaleTimeString()}.`
      : 'Too many requests. Please wait before trying again.')
  }

  function continueSession(result) {
    session.completeAuthentication(destination, result)
    if (result.session.access === 'full') navigate(destination, { replace: true })
  }

  function confirm() {
    return run(async () => {
      try {
        const result = await confirmVerification(token)
        if (!alive.current) return
        setToken('')
        if (result.session) continueSession(result)
        else {
          setConfirmed(true)
          setFeedback('Email verified. Log in to continue.')
        }
      } catch (error) {
        if (!alive.current) return
        if (error.code === 'TOO_MANY_ATTEMPTS') throttle(error)
        else {
          setToken('')
          if (error.code === 'TOKEN_INVALID_OR_EXPIRED' || error.code === 'VALIDATION_ERROR') setError(INVALID_LINK)
          else {
            setUncertain(true)
            setError('We couldn’t confirm the result. Your email may already be verified. Check your session or log in before requesting another link.')
          }
        }
      }
    })
  }

  function resend(event) {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    const validation = validateLoginField('email', { email: normalizedEmail })
    if (validation) { setError(validation); return }
    return run(async () => {
      try {
        const message = await resendVerification(normalizedEmail)
        if (alive.current) setFeedback(`${message}. If a replacement was issued, only the newest link works.`)
      } catch (error) {
        if (!alive.current) return
        if (error.code === 'TOO_MANY_ATTEMPTS') throttle(error)
        else setError(error.code === 'MAIL_UNAVAILABLE'
          ? 'Verification email is unavailable. Try again later. Earlier links have not been replaced.'
          : 'We couldn’t confirm whether a replacement was issued. Check your inbox or try again later.')
      }
    })
  }

  function checkSession() {
    return run(async () => {
      try {
        const result = await getCurrentUser({ activity: true })
        if (!alive.current) return
        if (result.session.access === 'full') continueSession(result)
        else setFeedback('Your session still requires verification. Log in or request a replacement link.')
      } catch (error) {
        if (alive.current) setError(error.code === 'AUTHENTICATION_REQUIRED'
          ? 'Your session has ended. Log in to check verification.'
          : 'We couldn’t check your session. Try again or log in.')
      }
    })
  }

  return <main className="entry-main">
    <meta name="referrer" content="no-referrer" />
    <div className="auth-page">
      <h1>Verify your email</h1>
      {session.status === 'verification_required' && <p>Check the verification email sent to {session.user.email}.</p>}
      {(error || feedback) && <div className="auth-notice" ref={notice} tabIndex="-1" role={error ? 'alert' : 'status'}>{error || feedback}</div>}
      {token && <><p>Confirm to verify the email address from this link.</p>
        <button type="button" onClick={confirm} disabled={pending || Boolean(retryAt)}>Confirm email</button></>}
      {!token && !confirmed && !uncertain && <p>Open your newest email link to confirm. If you reloaded this page, reopen the link or request a replacement.</p>}
      {uncertain && <button type="button" onClick={checkSession} disabled={pending || Boolean(retryAt)}>Check session</button>}
      {!confirmed && <form className="auth-form" onSubmit={resend} noValidate>
        <div className="auth-field">
          <label htmlFor="verification-email">Email</label>
          <input id="verification-email" type="email" autoComplete="email" value={email}
            disabled={pending} onChange={event => setEmail(event.target.value)} />
        </div>
        <button type="submit" disabled={pending || Boolean(retryAt)}>Resend verification email</button>
        {retryAt && <p role="status">Please wait until {new Date(retryAt).toLocaleTimeString()} before trying again.</p>}
      </form>}
      {pending && <p role="status">Please wait…</p>}
      <p><Link to="/login" state={{ destination, requireLogin: true }}>Go to Login</Link></p>
      <p><Link to="/forgot-password" state={{ destination }}>Account recovery</Link></p>
      {session.user && <LogoutButton />}
    </div>
  </main>
}
