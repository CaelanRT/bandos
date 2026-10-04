import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LoginNotice } from './LoginNotice.jsx'
import { PasswordVisibility } from './PasswordVisibility.jsx'
import { login } from '../../api/auth.js'
import { resolveDestination } from '../../app/destination.js'
import { useSession } from '../../app/sessionContext.js'
import {
  normalizeLogin,
  validateLogin,
} from './loginValidation.js'

const INITIAL_VALUES = { email: '', password: '' }
const FIELD_ORDER = ['email', 'password']

export function LoginForm() {
  const location = useLocation()
  const session = useSession()
  const destination = resolveDestination(location.state?.destination)
  const [values, setValues] = useState(INITIAL_VALUES)
  const [errors, setErrors] = useState({})
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState(null)
  const [focusField, setFocusField] = useState(null)
  const [retryAt, setRetryAt] = useState(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const formErrorRef = useRef(null)

  function updateField(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFormError((current) => current?.code === 'INVALID_CREDENTIALS' ? null : current)
  }

  useEffect(() => {
    if (formError || session.completionError) formErrorRef.current?.focus()
  }, [formError, session.completionError])

  useEffect(() => {
    if (focusField === 'email') emailRef.current?.focus()
    if (focusField === 'password') passwordRef.current?.focus()
  }, [focusField])

  useEffect(() => {
    function refreshRateLimit() {
      if (retryAt && Date.now() >= retryAt) setRetryAt(null)
    }

    document.addEventListener('visibilitychange', refreshRateLimit)
    return () => document.removeEventListener('visibilitychange', refreshRateLimit)
  }, [retryAt])

  async function submit(event) {
    event.preventDefault()
    if (pending) return

    if (retryAt && Date.now() < retryAt) {
      formErrorRef.current?.focus()
      return
    }
    if (retryAt) setRetryAt(null)

    const nextErrors = validateLogin(values)
    setErrors(nextErrors)
    setFormError(null)
    setFocusField(null)

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field])
    if (firstInvalid) {
      if (firstInvalid === 'email') emailRef.current?.focus()
      if (firstInvalid === 'password') passwordRef.current?.focus()
      return
    }

    setPending(true)
    try {
      await login(normalizeLogin(values))
      await session.completeAuthentication(destination)
    } catch (error) {
      if (error?.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(error.retryAt ?? null)
        const timing = error.retryAt ? ` Try again after ${new Date(error.retryAt).toLocaleTimeString()}.` : ' Please wait before trying again.'
        setFormError({ code: error.code, message: `${error.message}${timing}` })
      } else if (error?.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
        const fieldErrors = {}
        const remaining = []
        for (const detail of error.details) {
          if (FIELD_ORDER.includes(detail.field)) fieldErrors[detail.field] = detail.message
          else remaining.push(detail.message)
        }
        setErrors((current) => ({ ...current, ...fieldErrors }))
        if (remaining.length > 0) {
          setFormError({ code: error.code, message: remaining.join(' ') })
        } else {
          setFocusField(FIELD_ORDER.find((field) => fieldErrors[field]))
        }
      } else {
        setFormError({
          code: error?.code,
          message: error?.code === 'INVALID_CREDENTIALS'
            ? 'Invalid email or password'
            : 'We couldn’t log you in. Try again.',
        })
      }
    } finally {
      setPending(false)
    }
  }

  const completionError = session.completionError

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <LoginNotice />
      {(formError || completionError) && (
        <div className="auth-notice" ref={formErrorRef} role="alert" tabIndex="-1">
          {formError?.message || 'We couldn’t complete sign-in. Please try again.'}
        </div>
      )}

      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <input
          ref={emailRef}
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          disabled={pending}
          value={values.email}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
          onChange={(event) => updateField('email', event.target.value)}
        />
        {errors.email && <p id="login-email-error">{errors.email}</p>}
      </div>

      <div className="auth-field">
        <label htmlFor="login-password">Password</label>
        <div className="password-control">
          <input
            ref={passwordRef}
            id="login-password"
            name="password"
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            disabled={pending}
            value={values.password}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            onChange={(event) => updateField('password', event.target.value)}
          />
          <PasswordVisibility
            controls="login-password"
            visible={passwordVisible}
            disabled={pending}
            onToggle={() => setPasswordVisible((visible) => !visible)}
          />
        </div>
        {errors.password && <p id="login-password-error">{errors.password}</p>}
      </div>

      <button type="submit" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
      {pending && <span role="status">Logging in…</span>}

      <p>
        Need an account?{' '}
        <Link
          to="/register"
          state={{ destination }}
          aria-disabled={pending ? 'true' : undefined}
          onClick={(event) => pending && event.preventDefault()}
        >
          Register
        </Link>
        .
      </p>
    </form>
  )
}
