import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../app/sessionContext.js'
import { readProfile } from './profile.js'

export function DeactivateAccount({ user, disabled, setPending }) {
  const { authenticatedRequest, finishDeactivation } = useSession()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reconciliation, setReconciliation] = useState(null)
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
    if (submitting.current || busy || reconciliation === 'checking') return
    setOpen(false)
    setPassword('')
    setPasswordError(null)
    setError(null)
  }

  async function checkAccount(signal = lifetime.current.signal) {
    setReconciliation('checking')
    setPending(true)
    try {
      const latest = await readProfile(authenticatedRequest, signal)
      if (signal.aborted) return
      if (latest.userId !== user.userId) throw new Error('Current user changed')
      setReconciliation('active')
      setError('Your account is still active. You can choose to try deactivation again.')
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      setReconciliation('failed')
      setError('We couldn’t check your account status. Check again before another attempt.')
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }

  async function confirm(event) {
    event.preventDefault()
    if (submitting.current || disabled || busy || ['checking', 'failed'].includes(reconciliation)) return
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
      const result = await authenticatedRequest('/users/me', {
        method: 'DELETE', body: { password }, signal, expectedStatus: 200,
      })
      if (signal.aborted) return
      if (result?.message !== 'Account deactivated') throw new Error('Unexpected deactivation response')
      finishDeactivation()
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (failure.code === 'INVALID_CREDENTIALS') {
        setPasswordError('That password is incorrect. Try again.')
      } else if (failure.code === 'TOO_MANY_ATTEMPTS') {
        setError('Too many attempts. Please wait before trying again.')
      } else if (failure.code === 'VALIDATION_ERROR') {
        setError('Check your password and try again.')
      } else {
        setError('We couldn’t confirm your account status. Checking before another attempt.')
        await checkAccount(signal)
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) {
        setBusy(false)
        setPending(false)
      }
    }
  }

  return <section aria-labelledby="deactivate-heading">
    <h2 id="deactivate-heading">Deactivate account</h2>
    <button ref={trigger} type="button" disabled={disabled} onClick={() => setOpen(true)}>Deactivate account</button>
    {open && <dialog ref={dialog} aria-labelledby="deactivate-title" aria-describedby="deactivate-description"
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
      onCancel={(event) => { event.preventDefault(); close() }}>
      <h2 id="deactivate-title">Deactivate @{user.username}?</h2>
      <p id="deactivate-description">Your access will end and you will disappear from active band member lists. Existing band and event records will remain.</p>
      <form className="band-form" onSubmit={confirm} noValidate>
        <label htmlFor="deactivate-password">Current password</label>
        <input ref={passwordInput} id="deactivate-password" type="password" autoComplete="current-password"
          value={password} disabled={busy || reconciliation === 'checking'}
          aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? 'deactivate-password-error' : undefined}
          onChange={(event) => { setPassword(event.target.value); setPasswordError(null) }} />
        {passwordError && <p id="deactivate-password-error" ref={passwordErrorMessage} role="alert" tabIndex="-1">{passwordError}</p>}
        {error && <p role="alert">{error}</p>}
        {reconciliation === 'checking' && <p role="status">Checking your account status…</p>}
        {reconciliation === 'failed' && <button type="button" onClick={() => checkAccount()}>Check again</button>}
        {busy && reconciliation !== 'checking' && <p role="status">Deactivating account…</p>}
        <div className="form-actions">
          <button type="button" disabled={busy || reconciliation === 'checking'} onClick={close}>Cancel</button>
          <button type="submit" disabled={busy || reconciliation === 'checking' || reconciliation === 'failed'}>Deactivate account</button>
        </div>
      </form>
    </dialog>}
  </section>
}
