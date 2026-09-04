import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PasswordVisibility } from './PasswordVisibility.jsx'
import { register } from '../../api/auth.js'
import { resolveDestination } from '../../app/destination.js'
import { useSession } from '../../app/sessionContext.js'
import {
  normalizeRegistration,
  validateRegistration,
  validateRegistrationField,
} from './registrationValidation.js'

const INITIAL_VALUES = { firstName: '', lastName: '', username: '', email: '', password: '' }
const FIELDS = [
  { name: 'firstName', label: 'First name', autoComplete: 'given-name' },
  { name: 'lastName', label: 'Last name', autoComplete: 'family-name' },
  { name: 'username', label: 'Username', autoComplete: 'username', hint: '3–50 characters' },
  { name: 'email', label: 'Email', autoComplete: 'email', type: 'email' },
  { name: 'password', label: 'Password', autoComplete: 'new-password', hint: '8–72 characters' },
]
const FIELD_ORDER = FIELDS.map(({ name }) => name)

export function RegistrationForm() {
  const location = useLocation()
  const session = useSession()
  const destination = resolveDestination(location.state?.destination)
  const [values, setValues] = useState(INITIAL_VALUES)
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState(null)
  const [focusField, setFocusField] = useState(null)
  const [retryAt, setRetryAt] = useState(null)
  const fieldRefs = useRef({})
  const submitting = useRef(false)
  const formErrorRef = useRef(null)

  function updateField(field, value) {
    const nextValues = { ...values, [field]: value }
    setValues(nextValues)
    if (touched[field]) {
      setErrors((current) => ({
        ...current,
        [field]: validateRegistrationField(field, nextValues),
      }))
    }
  }

  function blurField(field) {
    setTouched((current) => ({ ...current, [field]: true }))
    setErrors((current) => ({
      ...current,
      [field]: validateRegistrationField(field, values),
    }))
  }

  useEffect(() => {
    if (formError || session.completionError) formErrorRef.current?.focus()
  }, [formError, session.completionError])

  useEffect(() => {
    fieldRefs.current[focusField]?.focus()
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
    if (submitting.current) return

    if (retryAt && Date.now() < retryAt) {
      formErrorRef.current?.focus()
      return
    }
    if (retryAt) setRetryAt(null)

    const nextErrors = validateRegistration(values)
    setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])))
    setErrors(nextErrors)
    setFormError(null)
    setFocusField(null)

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field])
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus()
      return
    }

    submitting.current = true
    setPending(true)
    try {
      await register(normalizeRegistration(values))
      await session.completeAuthentication(destination)
    } catch (error) {
      if (error?.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(error.retryAt ?? null)
        const timing = error.retryAt ? ` Try again after ${new Date(error.retryAt).toLocaleTimeString()}.` : ' Please wait before trying again.'
        setFormError(`${error.message}${timing}`)
      } else if (error?.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
        const fieldErrors = {}
        const remaining = []
        for (const detail of error.details) {
          if (FIELD_ORDER.includes(detail.field)) fieldErrors[detail.field] = detail.message
          else remaining.push(detail.message)
        }
        setErrors((current) => ({ ...current, ...fieldErrors }))
        if (remaining.length > 0) {
          setFormError(remaining.join(' '))
        } else if (Object.keys(fieldErrors).length === 0) {
          setFormError('We couldn’t create your account. Check your details and try again.')
        } else {
          setFocusField(FIELD_ORDER.find((field) => fieldErrors[field]))
        }
      } else {
        setFormError(
          error?.code === 'ACCOUNT_CONFLICT'
            ? 'That username or email is already in use.'
            : 'We couldn’t create your account. Try again.',
        )
      }
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  const completionError = session.completionError

  return (
    <form onSubmit={submit} noValidate>
      {(formError || completionError) && (
        <div ref={formErrorRef} role="alert" tabIndex="-1">
          {formError || 'We couldn’t complete sign-in after registration. Please log in.'}
        </div>
      )}

      {FIELDS.map(({ name, label, autoComplete, hint, type = 'text' }) => {
        const id = `register-${name}`
        const describedBy = [hint && `${id}-hint`, errors[name] && `${id}-error`].filter(Boolean).join(' ')
        return (
          <div key={name}>
            <label htmlFor={id}>{label}</label>
            <input
              ref={(element) => { fieldRefs.current[name] = element }}
              id={id}
              name={name}
              type={name === 'password' ? (passwordVisible ? 'text' : 'password') : type}
              autoComplete={autoComplete}
              disabled={pending}
              value={values[name]}
              aria-invalid={Boolean(errors[name])}
              aria-describedby={describedBy || undefined}
              onBlur={() => blurField(name)}
              onChange={(event) => updateField(name, event.target.value)}
            />
            {name === 'password' && (
              <PasswordVisibility
                controls={id}
                visible={passwordVisible}
                disabled={pending}
                onToggle={() => setPasswordVisible((visible) => !visible)}
              />
            )}
            {hint && <p id={`${id}-hint`}>{hint}</p>}
            {errors[name] && <p id={`${id}-error`}>{errors[name]}</p>}
          </div>
        )
      })}

      <button type="submit" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </button>
      {pending && <span role="status">Creating account…</span>}

      <p>
        Already have an account?{' '}
        <Link
          to="/login"
          state={{ destination }}
          aria-disabled={pending ? 'true' : undefined}
          onClick={(event) => pending && event.preventDefault()}
        >
          Log in
        </Link>
        .
      </p>
    </form>
  )
}
