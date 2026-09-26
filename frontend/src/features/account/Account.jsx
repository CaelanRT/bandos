import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BandShell } from '../bands/BandViews.jsx'
import { useBands } from '../bands/queries.js'
import { useSession } from '../../app/sessionContext.js'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { changedProfile, profileFields, profileValues, readProfile, saveProfile, validateProfile } from './profile.js'
import { reconcileProfileMembers } from './queries.js'

const fields = [
  { name: 'firstName', label: 'First name', autoComplete: 'given-name' },
  { name: 'lastName', label: 'Last name', autoComplete: 'family-name' },
  { name: 'username', label: 'Username', autoComplete: 'username' },
]

export function Account() {
  const bands = useBands()
  const client = useQueryClient()
  const { user, authenticatedRequest, updateCurrentUser } = useSession()
  const [values, setValues] = useState(() => profileValues(user))
  const [baseline, setBaseline] = useState(() => profileValues(user))
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, setPending] = useState(false)
  const [reconciliation, setReconciliation] = useState(null)
  const [retryAt, setRetryAt] = useState(null)
  const [focusField, setFocusField] = useState(null)
  const inputs = useRef({})
  const notice = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const attempted = useRef(null)
  const currentBlocker = useRef(null)
  const dirty = profileFields.some((field) => values[field] !== baseline[field])
  const { blocker } = useUnsavedNavigation(dirty)
  useEffect(() => { currentBlocker.current = blocker }, [blocker])
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  if (!dirty && profileFields.some((field) => baseline[field] !== user[field])) {
    const latest = profileValues(user)
    setValues(latest); setBaseline(latest)
  }
  useEffect(() => { if (focusField) inputs.current[focusField]?.focus() }, [focusField])
  useEffect(() => {
    if (formError && !profileFields.some((field) => errors[field])) notice.current?.focus()
  }, [formError, errors])

  function accept(userValue, announcement) {
    updateCurrentUser(userValue)
    const latest = profileValues(userValue)
    setValues(latest); setBaseline(latest); setTouched({}); setErrors({})
    setFormError(null); setReconciliation(null); setMessage(announcement)
    if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed()
  }

  async function checkCurrentUser(signal = lifetime.current.signal) {
    setReconciliation('checking')
    try {
      const latest = await readProfile(authenticatedRequest, signal)
      if (signal.aborted) return
      if (latest.userId !== user.userId) throw new Error('Current user changed')
      updateCurrentUser(latest)
      await reconcileProfileMembers(client, latest, signal)
      if (signal.aborted) return
      if (Object.entries(attempted.current).every(([field, value]) => latest[field] === value)) {
        accept(latest, 'Your profile changes are saved.')
      } else {
        setBaseline(profileValues(latest))
        setReconciliation('different')
        setFormError(null)
      }
    } catch (error) {
      if (!signal.aborted && error.name !== 'AbortError' && error.code !== 'AUTHENTICATION_REQUIRED') {
        setReconciliation('failed')
      }
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current || ['checking', 'failed'].includes(reconciliation)) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const nextErrors = validateProfile(values)
    setTouched(Object.fromEntries(profileFields.map((field) => [field, true])))
    setErrors(nextErrors); setFormError(null); setMessage(null); setFocusField(null)
    const firstError = profileFields.find((field) => nextErrors[field])
    if (firstError) { setFocusField(firstError); inputs.current[firstError]?.focus(); return }
    const changes = changedProfile(values, user)
    if (Object.keys(changes).length === 0) {
      cancel()
      return
    }
    submitting.current = true; setPending(true); setReconciliation(null)
    attempted.current = changes
    const signal = lifetime.current.signal
    try {
      const saved = await saveProfile(authenticatedRequest, changes, user.userId, signal)
      if (signal.aborted) return
      await reconcileProfileMembers(client, saved, signal)
      if (!signal.aborted) accept(saved, 'Profile saved.')
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (error.code === 'ACCOUNT_CONFLICT') {
        setErrors({ username: 'That username is unavailable. Choose another.' })
        setFocusField('username')
      } else if (error.code === 'VALIDATION_ERROR') {
        const details = error.details ?? []
        const mapped = Object.fromEntries(details.filter((detail) => profileFields.includes(detail.field))
          .map((detail) => [detail.field, detail.message]))
        setErrors(mapped)
        setFormError(details.filter((detail) => !profileFields.includes(detail.field))
          .map((detail) => detail.message).join(' ') || (details.length ? null : 'Check your profile and try again.'))
        setFocusField(profileFields.find((field) => mapped[field]) ?? null)
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(error.retryAt ?? null)
        setFormError(error.retryAt ? `Too many attempts. Try again after ${new Date(error.retryAt).toLocaleTimeString()}.` :
          'Too many attempts. Please wait before trying again.')
      } else {
        setFormError('We couldn’t confirm whether your profile was saved. Checking the current profile before another attempt.')
        setPending(false)
        await checkCurrentUser(signal)
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  function cancel() {
    setValues(profileValues(user)); setBaseline(profileValues(user)); setTouched({}); setErrors({})
    setFormError(null); setMessage(null)
    if (reconciliation !== 'failed') setReconciliation(null)
    setRetryAt(null)
  }

  const checking = reconciliation === 'checking'
  return <BandShell bands={bands} context="Account">
    <h1>Account</h1>
    <form className="band-form" aria-label="Edit profile" onSubmit={submit} noValidate>
      {message && <p role="status">{message}</p>}
      {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
      {fields.map(({ name, label, autoComplete }) => <div key={name}>
        <label htmlFor={`account-${name}`}>{label}</label>
        <input ref={(node) => { inputs.current[name] = node }} id={`account-${name}`} name={name}
          value={values[name]} autoComplete={autoComplete} disabled={pending || checking}
          autoCapitalize={name === 'username' ? 'none' : undefined}
          spellCheck={name === 'username' ? false : undefined}
          aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `account-${name}-error` : undefined}
          onBlur={() => {
            setTouched((current) => ({ ...current, [name]: true }))
            setErrors((current) => ({ ...current, [name]: validateProfile(values)[name] }))
          }}
          onChange={(event) => {
            const next = { ...values, [name]: event.target.value }
            setValues(next); setMessage(null); setFocusField(null)
            if (touched[name]) setErrors((current) => ({ ...current, [name]: validateProfile(next)[name] }))
          }} />
        {errors[name] && <p id={`account-${name}-error`}>{errors[name]}</p>}
      </div>)}
      <dl>
        <dt>Email</dt><dd>{user.email}</dd>
        <dt>Plan</dt><dd>{user.plan}</dd>
      </dl>
      {checking && <p role="status">Checking the current profile…</p>}
      {reconciliation === 'failed' && <div role="alert">
        <p>We couldn’t check your current profile. Check again before saving.</p>
        <button type="button" onClick={() => checkCurrentUser()}>Check again</button>
      </div>}
      {reconciliation === 'different' && <p role="status">The current profile differs from your attempted changes. Your draft is preserved; review it before saving again.</p>}
      <div className="form-actions">
        <button type="submit" disabled={!dirty || pending || checking || reconciliation === 'failed'}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" disabled={pending || checking} onClick={cancel}>Cancel</button>
      </div>
      {pending && <p role="status">Saving profile…</p>}
    </form>
    <UnsavedNavigationDialog blocker={blocker} pending={pending || checking} />
  </BandShell>
}
