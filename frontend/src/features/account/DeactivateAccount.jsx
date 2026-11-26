import { userActivityRequest } from '../../app/activityQueries.js'
import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../app/sessionContext.js'
import { readProfile } from './profile.js'

export function DeactivateAccount({ user, disabled, setPending, onUnresolvedChange }) {
  const { authenticatedRequest, finishDeactivation, updateCurrentUser } = useSession()
  const mutation = useMutationIntent(authenticatedRequest)
  useEffect(() => { onUnresolvedChange(mutation.unresolved) }, [mutation.unresolved, onUnresolvedChange])
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef(null)
  const trigger = useRef(null)
  const passwordInput = useRef(null)
  const passwordErrorMessage = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    const previous = trigger.current
    element.showModal()
    passwordInput.current?.focus()
    return () => {
      element.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  useEffect(() => {
    if (passwordError === 'That password is incorrect. Try again.') passwordErrorMessage.current?.focus()
  }, [passwordError])

  function close() {
    if (submitting.current || busy) return
    setOpen(false)
    if (!mutation.locked) setPassword('')
    setPasswordError(null)
    setError(null)
  }

  async function reloadLatest() {
    const latest = await readProfile(userActivityRequest(authenticatedRequest), lifetime.current.signal)
    if (lifetime.current.signal.aborted) throw new Error('Closed')
    updateCurrentUser(latest)
    setPassword('')
    setOpen(false)
  }

  async function confirm(event) {
    event.preventDefault()
    if (mutation.locked && !mutation.isRetry()) return
    if (submitting.current || disabled || busy) return
    if (typeof password !== 'string' || password.length === 0) {
      setPasswordError('Enter your current password.')
      passwordInput.current?.focus()
      return
    }
    submitting.current = true
    setBusy(true)
    setPending(true)
    setPasswordError(null)
    setError(null)
    const signal = lifetime.current.signal
    try {
      const result = await mutation.request('/users/me', {
        method: 'DELETE', body: { password, expectedVersion: user.version }, signal, expectedStatus: 200,
      })
      if (signal.aborted) return
      if (result?.message !== 'Account deactivated') throw new Error('Unexpected deactivation response')
      mutation.complete()
      finishDeactivation()
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (mutation.handleError(failure)) return
      if (['INVALID_CREDENTIALS', 'CURRENT_PASSWORD_INCORRECT'].includes(failure.code)) {
        setPasswordError('That password is incorrect. Try again.')
      } else if (failure.code === 'TOO_MANY_ATTEMPTS') {
        setError('Too many attempts. Please wait before trying again.')
      } else if (failure.code === 'VALIDATION_ERROR') {
        setError('Check your password and try again.')
      } else {
        setError('The request was rejected. Please review it and try again.')
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) {
        setBusy(false)
        setPending(false)
      }
    }
  }

  return <section className="account-deactivation" aria-labelledby="deactivate-heading">
    <h2 id="deactivate-heading">Deactivate account</h2>
    <button className="account-deactivation-trigger" ref={trigger} type="button" disabled={disabled} onClick={() => setOpen(true)}>Deactivate account</button>
    {open && <dialog className="account-deactivation-dialog" ref={dialog} aria-labelledby="deactivate-title" aria-describedby="deactivate-description"
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
      onCancel={(event) => { event.preventDefault(); close() }}>
      <h2 id="deactivate-title">Deactivate @{user.username}?</h2>
      <p id="deactivate-description">Your access will end and you will disappear from active band member lists. Existing band and event records will remain.</p>
      <form className="band-form account-deactivation-form" onSubmit={confirm} noValidate>
        <label htmlFor="deactivate-password">Current password</label>
        <input ref={passwordInput} id="deactivate-password" type="password" autoComplete="current-password"
          value={password} disabled={busy || mutation.locked}
          aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? 'deactivate-password-error' : undefined}
          onChange={(event) => { setPassword(event.target.value); setPasswordError(null) }} />
        {passwordError && <p id="deactivate-password-error" className="account-field-error" ref={passwordErrorMessage} role="alert" tabIndex="-1">{passwordError}</p>}
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Deactivating account…</p>}
        <MutationRecovery mutation={mutation} pending={busy} onRetry={() => confirm({ preventDefault() {} })} onReload={reloadLatest} />
        <div className="form-actions">
          <button type="button" disabled={busy} onClick={close}>Cancel</button>
          <button className="account-deactivation-confirm" type="submit" disabled={mutation.locked || busy}>Deactivate account</button>
        </div>
      </form>
    </dialog>}
  </section>
}
