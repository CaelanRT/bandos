import { validatePasswordFields } from '../auth/newPasswordValidation.js'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../app/sessionContext.js'
import { userActivityRequest } from '../../app/activityQueries.js'
import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { check, text } from '../../api/boundary.js'
import { PasswordFields } from '../auth/PasswordFields.jsx'
import { readProfile } from './profile.js'

const EMPTY = { currentPassword: '', newPassword: '', confirmation: '' }

export function ChangePassword({ disabled, onStateChange }) {
  const session = useSession()
  const mutation = useMutationIntent(session.authenticatedRequest)
  const [version, setVersion] = useState(session.user.version)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const busy = useRef(false)
  const lifetime = useRef(null)
  const notice = useRef(null)
  if (!Object.values(values).some(Boolean) && !mutation.locked && version !== session.user.version) setVersion(session.user.version)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => {
    onStateChange({ pending, locked: mutation.locked, unresolved: mutation.unresolved })
  }, [pending, mutation.locked, mutation.unresolved, onStateChange])
  useEffect(() => { if (error || Object.values(errors).some(Boolean)) notice.current?.focus() }, [error, errors])
  useEffect(() => {
    if (!retryAt) return
    const timer = setTimeout(() => setRetryAt(null), Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [retryAt])

  async function reloadLatest() {
    const signal = lifetime.current.signal
    const latest = await readProfile(userActivityRequest(session.authenticatedRequest), signal)
    if (signal.aborted) throw new Error('Closed')
    setValues(EMPTY); setErrors({}); setError(''); setVersion(latest.version)
    session.updateCurrentUser(latest)
  }

  async function submit(event) {
    event.preventDefault()
    if (busy.current || disabled || (mutation.locked && !mutation.isRetry()) || (retryAt && Date.now() < retryAt)) return
    const invalid = validatePasswordFields(values, true)
    setErrors(invalid); setError('')
    if (Object.values(invalid).some(Boolean)) return
    busy.current = true; setPending(true)
    const signal = lifetime.current.signal
    try {
      const result = await mutation.request('/users/me/password', {
        method: 'POST', body: { expectedVersion: version, currentPassword: values.currentPassword, newPassword: values.newPassword },
        expectedStatus: 200, signal,
      })
      if (signal.aborted) return
      check(text(result?.message))
      mutation.complete()
      session.finishPasswordUpdate('passwordChanged')
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (mutation.handleError(failure)) return
      if (failure.code === 'CURRENT_PASSWORD_INCORRECT') setErrors({ currentPassword: 'Current password is incorrect.' })
      else if (failure.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(failure.retryAt || null)
        setError(failure.retryAt ? `Too many attempts. Try again after ${new Date(failure.retryAt).toLocaleTimeString()}.` : 'Too many attempts. Please wait before trying again.')
      } else if (failure.code === 'VALIDATION_ERROR') {
        const mapped = Object.fromEntries((failure.details || []).filter(detail => Object.hasOwn(EMPTY, detail.field)).map(detail => [detail.field, detail.message]))
        setErrors(mapped); setError('Check the password fields and try again.')
      } else setError('The request was rejected. Review your password and try again.')
    } finally {
      busy.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  return <section className="account-profile" aria-labelledby="change-password-heading">
    <h2 id="change-password-heading">Change password</h2>
    <p>Changing your password signs out all devices, including this one. Log in again afterward.</p>
    <form className="auth-form" aria-label="Change password" onSubmit={submit} noValidate>
      {(error || Object.values(errors).some(Boolean)) && <p role="alert" ref={notice} tabIndex="-1">{error || 'Check the password fields below.'}</p>}
      <MutationRecovery mutation={mutation} pending={pending} onRetry={() => submit({ preventDefault() {} })} onReload={reloadLatest} />
      {mutation.unresolved && <p>If the change already committed, your session was revoked. A session-ended response on retry does not mean the first change failed. Log in with the new password or use password recovery.</p>}
      <PasswordFields current values={values} errors={errors} disabled={disabled || pending || mutation.locked} onChange={(name, value) => {
        setValues(previous => ({ ...previous, [name]: value })); setErrors({}); setError('')
      }} />
      <div className="form-actions">
        <button type="submit" disabled={disabled || pending || mutation.locked || Boolean(retryAt)}>{pending ? 'Changing password…' : 'Change password'}</button>
        <button type="button" disabled={pending || mutation.locked} onClick={() => {
          setValues(EMPTY); setVersion(session.user.version); setErrors({}); setError('')
        }}>Clear password fields</button>
      </div>
    </form>
  </section>
}
