import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../app/sessionContext.js'
import { userActivityRequest } from '../../app/activityQueries.js'
import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { validateLoginField } from '../auth/loginValidation.js'
import { readProfile, requestEmailChange, resendEmailChange } from './profile.js'

const EMPTY = { newEmail: '', currentPassword: '' }
const FIELDS = ['newEmail', 'currentPassword']

function retryMessage(retryAt) {
  return retryAt
    ? `Too many attempts. Try again after ${new Date(retryAt).toLocaleTimeString()}.`
    : 'Too many attempts. Please wait before trying again.'
}

export function EmailChange({ disabled, onStateChange }) {
  const session = useSession()
  const { user } = session
  const mutation = useMutationIntent(session.authenticatedRequest)
  const resendMutation = useMutationIntent(session.authenticatedRequest)
  const [version, setVersion] = useState(user.version)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const [resendPending, setResendPending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const [resendRetryAt, setResendRetryAt] = useState(null)
  const busy = useRef(false)
  const resendBusy = useRef(false)
  const lifetime = useRef(null)
  const notice = useRef(null)
  const resendNotice = useRef(null)
  const inputs = useRef({})

  const hasDraft = Boolean(values.newEmail || values.currentPassword)
  if (!hasDraft && !mutation.locked && version !== user.version) setVersion(user.version)

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    onStateChange({
      pending: pending || resendPending,
      locked: mutation.locked || resendMutation.locked,
      unresolved: mutation.unresolved || resendMutation.unresolved,
    })
  }, [pending, resendPending, mutation.locked, resendMutation.locked, mutation.unresolved, resendMutation.unresolved, onStateChange])

  useEffect(() => {
    if (formError || Object.values(errors).some(Boolean)) notice.current?.focus()
  }, [formError, errors])

  useEffect(() => {
    if (resendError) resendNotice.current?.focus()
  }, [resendError])

  useEffect(() => {
    if (!retryAt) return
    const timer = setTimeout(() => setRetryAt(null), Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [retryAt])

  useEffect(() => {
    if (!resendRetryAt) return
    const timer = setTimeout(() => setResendRetryAt(null), Math.max(0, resendRetryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [resendRetryAt])

  async function reloadLatest() {
    const signal = lifetime.current.signal
    const latest = await readProfile(userActivityRequest(session.authenticatedRequest), signal)
    if (signal.aborted) throw new Error('Closed')
    setValues(EMPTY); setErrors({}); setFormError(''); setResendError(''); setResendMessage('')
    setVersion(latest.version)
    session.updateCurrentUser(latest)
    setMessage('Latest account details loaded.')
  }

  async function submit(event) {
    event.preventDefault()
    if (mutation.locked && !mutation.isRetry()) return
    if (busy.current || disabled || resendPending || resendMutation.locked) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const normalizedEmail = values.newEmail.trim().toLowerCase()
    const nextErrors = {}
    const emailError = validateLoginField('email', { email: normalizedEmail })
    if (emailError) nextErrors.newEmail = emailError
    if (!values.currentPassword) nextErrors.currentPassword = 'Enter your current password.'
    setErrors(nextErrors); setFormError(''); setMessage(''); setResendMessage(''); setResendError('')
    const firstError = FIELDS.find((field) => nextErrors[field])
    if (firstError) { inputs.current[firstError]?.focus(); return }
    const hadPending = Boolean(user.pendingEmail)
    const submittedVersion = version
    busy.current = true; setPending(true)
    const signal = lifetime.current.signal
    try {
      const saved = await requestEmailChange(
        mutation.request,
        { expectedVersion: submittedVersion, currentPassword: values.currentPassword, newEmail: normalizedEmail },
        user.userId,
        signal,
      )
      if (signal.aborted) return
      mutation.complete()
      setVersion(saved.version)
      session.updateCurrentUser(saved)
      setValues(EMPTY); setErrors({}); setFormError(''); setRetryAt(null)
      if (saved.email === normalizedEmail) {
        setMessage('That email address is already your active email address.')
      } else if (saved.pendingEmail === normalizedEmail && saved.version === submittedVersion) {
        setMessage(`Verification is already pending for ${saved.pendingEmail}. Use Resend verification email to issue a new link.`)
      } else if (hadPending) {
        setMessage(`Pending email updated to ${saved.pendingEmail}. Verification email queued for ${saved.pendingEmail} and a security notice was queued for ${saved.email}. Only the newest verification link works.`)
      } else {
        setMessage(`Verification email queued for ${saved.pendingEmail} and a security notice was queued for ${saved.email}. Your current email remains active until verification.`)
      }
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (mutation.handleError(failure)) return
      if (failure.code === 'CURRENT_PASSWORD_INCORRECT') {
        setErrors({ currentPassword: 'Current password is incorrect.' })
      } else if (failure.code === 'ACCOUNT_CONFLICT') {
        setErrors({ newEmail: 'That email address is unavailable. Choose another.' })
      } else if (failure.code === 'VALIDATION_ERROR') {
        const mapped = Object.fromEntries((failure.details || [])
          .filter((detail) => FIELDS.includes(detail.field))
          .map((detail) => [detail.field, detail.message]))
        setErrors(mapped)
        setFormError(Object.keys(mapped).length ? '' : 'Check your email address and password and try again.')
      } else if (failure.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(failure.retryAt || null)
        setFormError(retryMessage(failure.retryAt))
      } else if (failure.code === 'MAIL_UNAVAILABLE') {
        setFormError('Verification email is unavailable right now. Your pending email was not changed and earlier links remain valid.')
      } else {
        setFormError('The request was rejected. Review your details and try again.')
      }
    } finally {
      busy.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  async function resend() {
    if (resendMutation.locked && !resendMutation.isRetry()) return
    if (resendBusy.current || disabled || pending || mutation.locked) return
    if (resendRetryAt && Date.now() < resendRetryAt) { resendNotice.current?.focus(); return }
    resendBusy.current = true; setResendPending(true)
    setResendError(''); setResendMessage('')
    const signal = lifetime.current.signal
    try {
      const serverMessage = await resendEmailChange(resendMutation.request, signal)
      if (signal.aborted) return
      resendMutation.complete()
      setResendRetryAt(null)
      setResendMessage(`${serverMessage}. Only the newest verification link works.`)
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (resendMutation.handleError(failure)) return
      if (failure.code === 'TOO_MANY_ATTEMPTS') {
        setResendRetryAt(failure.retryAt || null)
        setResendError(retryMessage(failure.retryAt))
      } else if (failure.code === 'MAIL_UNAVAILABLE') {
        setResendError('Verification email is unavailable right now. Earlier links have not been replaced.')
      } else if (failure.code === 'VALIDATION_ERROR') {
        setResendError('No email change is currently pending. Reload your account to see the latest details.')
      } else {
        setResendError('We couldn’t resend the verification email. Try again later.')
      }
    } finally {
      resendBusy.current = false
      if (!signal.aborted) setResendPending(false)
    }
  }

  const formLocked = disabled || pending || mutation.locked || resendPending || resendMutation.locked

  return <section className="account-profile" aria-labelledby="change-email-heading">
    <h2 id="change-email-heading">Change email address</h2>
    <p>Your current email address stays active until you verify the new one. A verification link is sent to the new address, and a security notice is sent to your current address.</p>
    {user.pendingEmail && <div className="account-pending-email">
      <p>Pending verification for {user.pendingEmail}. Your active email ({user.email}) remains in use until you confirm the link.</p>
      {resendMessage && <p role="status">{resendMessage}</p>}
      {resendError && <p role="alert" ref={resendNotice} tabIndex="-1">{resendError}</p>}
      <MutationRecovery mutation={resendMutation} pending={resendPending} onRetry={resend} onReload={reloadLatest} />
      <div className="form-actions">
        <button type="button" disabled={formLocked || Boolean(resendRetryAt)} onClick={resend}>
          {resendPending ? 'Resending…' : 'Resend verification email'}
        </button>
      </div>
    </div>}
    <form className="band-form account-form" aria-label="Change email address" onSubmit={submit} noValidate>
      {message && <p role="status">{message}</p>}
      {(formError || Object.values(errors).some(Boolean)) && (
        <p ref={notice} role="alert" tabIndex="-1">{formError || 'Check the email change fields below.'}</p>
      )}
      <MutationRecovery mutation={mutation} pending={pending} onRetry={() => submit({ preventDefault() {} })} onReload={reloadLatest} />
      <div className="account-field">
        <label htmlFor="email-change-new-email">New email address</label>
        <input
          ref={(node) => { inputs.current.newEmail = node }}
          id="email-change-new-email"
          name="newEmail"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={values.newEmail}
          disabled={formLocked}
          aria-invalid={Boolean(errors.newEmail)}
          aria-describedby={errors.newEmail ? 'email-change-new-email-error' : undefined}
          onChange={(event) => {
            setValues((current) => ({ ...current, newEmail: event.target.value }))
            setErrors((current) => ({ ...current, newEmail: undefined }))
            setFormError(''); setMessage('')
          }}
        />
        {errors.newEmail && <p id="email-change-new-email-error" className="account-field-error">{errors.newEmail}</p>}
      </div>
      <div className="account-field">
        <label htmlFor="email-change-current-password">Current password to confirm email change</label>
        <input
          ref={(node) => { inputs.current.currentPassword = node }}
          id="email-change-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          disabled={formLocked}
          aria-invalid={Boolean(errors.currentPassword)}
          aria-describedby={errors.currentPassword ? 'email-change-current-password-error' : undefined}
          onChange={(event) => {
            setValues((current) => ({ ...current, currentPassword: event.target.value }))
            setErrors((current) => ({ ...current, currentPassword: undefined }))
            setFormError(''); setMessage('')
          }}
        />
        {errors.currentPassword && <p id="email-change-current-password-error" className="account-field-error">{errors.currentPassword}</p>}
      </div>
      <div className="form-actions">
        <button type="submit" disabled={formLocked || Boolean(retryAt)}>
          {pending ? 'Saving…' : (user.pendingEmail ? 'Replace pending email' : 'Request email change')}
        </button>
        <button type="button" disabled={pending || mutation.locked} onClick={() => {
          setValues(EMPTY); setVersion(user.version); setErrors({}); setFormError(''); setMessage(''); setRetryAt(null)
        }}>Clear email fields</button>
      </div>
    </form>
  </section>
}
