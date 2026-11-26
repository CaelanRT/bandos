import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { requestPasswordReset } from './passwordApi.js'
import { validateLoginField } from './loginValidation.js'

export function ForgotPassword() {
  const location = useLocation()
  const navigate = useNavigate()
  useLayoutEffect(() => {
    if (location.search || location.hash) navigate('/forgot-password', { replace: true })
  }, [location.search, location.hash, navigate])
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retryAt, setRetryAt] = useState(null)
  const busy = useRef(false)
  const lifetime = useRef(null)
  const notice = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => { if (error || message) notice.current?.focus() }, [error, message])
  useEffect(() => {
    if (!retryAt) return
    const timer = setTimeout(() => setRetryAt(null), Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [retryAt])

  async function submit(event) {
    event.preventDefault()
    if (busy.current || (retryAt && Date.now() < retryAt)) return
    const normalized = email.trim().toLowerCase()
    const invalid = validateLoginField('email', { email: normalized })
    setMessage(''); setError(invalid || '')
    if (invalid) return
    busy.current = true; setPending(true)
    const signal = lifetime.current.signal
    try {
      const confirmation = await requestPasswordReset(normalized, signal)
      if (!signal.aborted) setMessage(`${confirmation}. If a replacement was issued, only the newest reset link works.`)
    } catch (failure) {
      if (signal.aborted) return
      if (failure.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(failure.retryAt || null)
        setError(failure.retryAt ? `Too many requests. Try again after ${new Date(failure.retryAt).toLocaleTimeString()}.` : 'Too many requests. Please wait before trying again.')
      } else setError(failure.code === 'MAIL_UNAVAILABLE'
        ? 'Password recovery email is unavailable. No reset link was issued. Try again later.'
        : 'We couldn’t confirm whether a reset email was queued. Check your inbox or try again later.')
    } finally {
      busy.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  return <main className="entry-main"><meta name="referrer" content="no-referrer" /><div className="auth-page">
    <h1>Forgot password</h1>
    {(error || message) && <p className="auth-notice" ref={notice} tabIndex="-1" role={error ? 'alert' : 'status'} id="recovery-notice">{error || message}</p>}
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="auth-field">
        <label htmlFor="recovery-email">Email</label>
        <input id="recovery-email" type="email" autoComplete="email" value={email} disabled={pending}
          aria-describedby={error ? 'recovery-notice' : undefined} onChange={event => setEmail(event.target.value)} />
      </div>
      <button type="submit" disabled={pending || Boolean(retryAt)}>{pending ? 'Requesting…' : 'Request reset link'}</button>
    </form>
    <p><Link to="/login" state={{ requireLogin: true }}>Go to Login</Link></p>
  </div></main>
}
