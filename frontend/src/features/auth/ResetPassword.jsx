import { validatePasswordFields } from './newPasswordValidation.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../app/sessionContext.js'
import { PasswordFields } from './PasswordFields.jsx'
import { resetPassword } from './passwordApi.js'

export function ResetPassword() {
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [token, setToken] = useState(() => new URLSearchParams(location.search).get('token') || '')
  const [values, setValues] = useState({ newPassword: '', confirmation: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const busy = useRef(false)
  const lifetime = useRef(null)
  const notice = useRef(null)
  useLayoutEffect(() => {
    if (location.search || location.hash) navigate('/reset-password', { replace: true })
  }, [location.search, location.hash, navigate])
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => { if (error || Object.values(errors).some(Boolean)) notice.current?.focus() }, [error, errors])
  useEffect(() => {
    if (!retryAt) return
    const timer = setTimeout(() => setRetryAt(null), Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [retryAt])

  async function submit(event) {
    event.preventDefault()
    if (!token || busy.current || (retryAt && Date.now() < retryAt)) return
    const invalid = validatePasswordFields(values)
    setErrors(invalid); setError('')
    if (Object.values(invalid).some(Boolean)) return
    busy.current = true; setPending(true)
    const signal = lifetime.current.signal
    try {
      await resetPassword(token, values.newPassword, signal)
      if (signal.aborted) return
      session.finishPasswordUpdate('passwordReset')
      navigate('/login', { replace: true, state: { notice: 'passwordReset', requireLogin: true } })
    } catch (failure) {
      if (signal.aborted) return
      if (failure.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(failure.retryAt || null)
        setError(failure.retryAt ? `Too many attempts. Try again after ${new Date(failure.retryAt).toLocaleTimeString()}.` : 'Too many attempts. Please wait before trying again.')
      } else if (failure.code === 'VALIDATION_ERROR') setError('Check the new password and try again.')
      else {
        setToken(''); setValues({ newPassword: '', confirmation: '' })
        setError(failure.code === 'TOKEN_INVALID_OR_EXPIRED'
          ? 'This reset link is invalid, expired or already used. Request a fresh link.'
          : 'We couldn’t confirm the reset. Your password may already have changed. Try logging in or request a fresh link; this request will not be retried.')
      }
    } finally {
      busy.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  return <main className="entry-main">
    <meta name="referrer" content="no-referrer" />
    <div className="auth-page">
      <h1>Reset password</h1>
      {(error || Object.values(errors).some(Boolean)) && <p className="auth-notice" role="alert" tabIndex="-1" ref={notice}>{error || 'Check the password fields below.'}</p>}
      {token ? <form className="auth-form" onSubmit={submit} noValidate>
        <p>Submit to reset your password. This signs out all devices and does not verify your email.</p>
        <PasswordFields values={values} errors={errors} disabled={pending} onChange={(name, value) => {
          setValues(previous => ({ ...previous, [name]: value })); setErrors({}); setError('')
        }} />
        <button type="submit" disabled={pending || Boolean(retryAt)}>{pending ? 'Resetting…' : 'Reset password'}</button>
      </form> : <p>Open your newest reset email link. If you reloaded this page, reopen the link or request a replacement.</p>}
      <p><Link to="/forgot-password">Request a fresh reset link</Link></p>
      <p><Link to="/login" state={{ requireLogin: true }}>Go to Login</Link></p>
    </div>
  </main>
}
