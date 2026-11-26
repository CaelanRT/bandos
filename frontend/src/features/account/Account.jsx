import { userActivityRequest } from '../../app/activityQueries.js'
import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BandShell } from '../bands/BandViews.jsx'
import { useBands } from '../bands/queries.js'
import { useSession } from '../../app/sessionContext.js'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { changedProfile, profileFields, profileValues, readProfile, saveProfile, validateProfile } from './profile.js'
import { reconcileProfileMembers } from './queries.js'
import { DeactivateAccount } from './DeactivateAccount.jsx'

const fields = [
  { name: 'firstName', label: 'First name', autoComplete: 'given-name' },
  { name: 'lastName', label: 'Last name', autoComplete: 'family-name' },
  { name: 'username', label: 'Username', autoComplete: 'username' },
]

export function Account() {
  const bands = useBands()
  const client = useQueryClient()
  const { user, authenticatedRequest, updateCurrentUser } = useSession()
  const mutation = useMutationIntent(authenticatedRequest)
  const [version, setVersion] = useState(user.version)
  const [values, setValues] = useState(() => profileValues(user))
  const [baseline, setBaseline] = useState(() => profileValues(user))
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, setPending] = useState(false)
  const [deactivationUnresolved, setDeactivationUnresolved] = useState(false)
  const [deactivationPending, setDeactivationPending] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const [focusField, setFocusField] = useState(null)
  const inputs = useRef({})
  const notice = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const currentBlocker = useRef(null)
  const dirty = profileFields.some((field) => values[field] !== baseline[field])
  const { blocker } = useUnsavedNavigation(dirty || deactivationPending || deactivationUnresolved || mutation.unresolved)
  useEffect(() => { currentBlocker.current = blocker }, [blocker])
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  if (!dirty && !mutation.locked && (version !== user.version || profileFields.some((field) => baseline[field] !== user[field]))) {
    const latest = profileValues(user)
    setValues(latest); setBaseline(latest); setVersion(user.version)
  }
  useEffect(() => { if (focusField) inputs.current[focusField]?.focus() }, [focusField])
  useEffect(() => {
    if (formError && !profileFields.some((field) => errors[field])) notice.current?.focus()
  }, [formError, errors])

  function accept(userValue, announcement) {
    setVersion(userValue.version)
    updateCurrentUser(userValue)
    const latest = profileValues(userValue)
    setValues(latest); setBaseline(latest); setTouched({}); setErrors({})
    setFormError(null); setMessage(announcement)
    if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed()
  }

  async function reloadLatest() {
    const latest = await readProfile(userActivityRequest(authenticatedRequest), lifetime.current.signal)
    if (lifetime.current.signal.aborted) throw new Error('Closed')
    accept(latest, 'Latest profile loaded.')
  }

  async function submit(event) {
    event.preventDefault()
    if (mutation.locked && !mutation.isRetry()) return
    if (submitting.current || deactivationUnresolved) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const nextErrors = validateProfile(values)
    setTouched(Object.fromEntries(profileFields.map((field) => [field, true])))
    setErrors(nextErrors); setFormError(null); setMessage(null); setFocusField(null)
    const firstError = profileFields.find((field) => nextErrors[field])
    if (firstError) { setFocusField(firstError); inputs.current[firstError]?.focus(); return }
    const changes = changedProfile(values, baseline)
    if (Object.keys(changes).length === 0) {
      cancel()
      return
    }
    submitting.current = true; setPending(true)
    const signal = lifetime.current.signal
    try {
      const saved = await saveProfile(mutation.request, { ...changes, expectedVersion: version }, user.userId, signal)
      if (signal.aborted) return
      mutation.complete()
      await reconcileProfileMembers(client, saved, signal)
      if (!signal.aborted) accept(saved, 'Profile saved.')
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (mutation.handleError(error)) return
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
        setFormError('The request was rejected. Review your details and try again.')
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  function cancel() {
    if (mutation.locked) return
    setVersion(user.version)
    setValues(profileValues(user)); setBaseline(profileValues(user)); setTouched({}); setErrors({})
    setFormError(null); setMessage(null)
    setRetryAt(null)
  }

  return <BandShell bands={bands} context="Account">
    <div className="account-page">
      <header className="account-heading">
        <h1>Account</h1>
        <p>@{user.username}</p>
      </header>
      <section className="account-profile" aria-labelledby="account-profile-heading">
        <h2 id="account-profile-heading">Profile</h2>
        <form className="band-form account-form" aria-label="Edit profile" onSubmit={submit} noValidate>
          {message && <p role="status">{message}</p>}
          {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
          <MutationRecovery mutation={mutation} pending={pending} onRetry={() => submit({ preventDefault() {} })} onReload={reloadLatest} />
          {fields.map(({ name, label, autoComplete }) => <div className="account-field" key={name}>
            <label htmlFor={`account-${name}`}>{label}</label>
            <input ref={(node) => { inputs.current[name] = node }} id={`account-${name}`} name={name}
              value={values[name]} autoComplete={autoComplete} disabled={pending || deactivationUnresolved || mutation.locked}
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
            {errors[name] && <p id={`account-${name}-error`} className="account-field-error">{errors[name]}</p>}
          </div>)}
          <div className="form-actions">
            <button type="submit" disabled={mutation.locked || deactivationUnresolved || !dirty || pending}>{pending ? 'Saving…' : 'Save'}</button>
            <button type="button" disabled={pending} onClick={cancel}>Cancel</button>
          </div>
          {pending && <p role="status">Saving profile…</p>}
        </form>
      </section>
      <section className="account-details" aria-labelledby="account-details-heading">
        <h2 id="account-details-heading">Account details</h2>
        <dl>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Plan</dt><dd>{user.plan}</dd></div>
        </dl>
      </section>
      <DeactivateAccount user={user} disabled={pending || mutation.locked} setPending={setDeactivationPending} onUnresolvedChange={setDeactivationUnresolved} />
      <UnsavedNavigationDialog unresolved={mutation.unresolved || deactivationUnresolved} blocker={blocker} pending={pending || deactivationPending} className="account-unsaved-dialog" />
    </div>
  </BandShell>
}
