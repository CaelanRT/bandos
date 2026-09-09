import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../app/sessionContext.js'
import { resolveCreationOrigin } from '../../app/destination.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { composeValidators, maxLength, required } from '../../utils/validation.js'
import { createBand } from './api.js'
import { cacheCreatedBand, checkBands, useBands } from './queries.js'
import { BandLinks, BandShell } from './BandViews.jsx'

const validateName = composeValidators(required('Enter a band name.'), maxLength(50))

export function CreateBand() {
  const bands = useBands()
  const client = useQueryClient()
  const { authenticatedRequest, user } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const origin = resolveCreationOrigin(location.state?.creationOrigin)
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)
  const [reconciliation, setReconciliation] = useState(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const [retryAt, setRetryAt] = useState(null)
  const field = useRef(null)
  const notice = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const { blocker, allowNavigation } = useUnsavedNavigation(name !== '')
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (formError) notice.current?.focus()
  }, [formError])
  useEffect(() => {
    if (focusRequest && !pending) field.current?.focus()
  }, [focusRequest, pending])

  async function reconcile(signal = lifetime.current.signal) {
    setReconciliation('checking')
    try {
      await checkBands(client, authenticatedRequest, signal)
      if (!signal.aborted) setReconciliation('checked')
    } catch {
      if (!signal.aborted) setReconciliation('failed')
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current || reconciliation === 'checking' || reconciliation === 'failed') return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const error = validateName(name.trim())
    setTouched(true)
    setFocusRequest(0)
    setFieldError(error)
    setFormError(null)
    if (error) { field.current?.focus(); return }
    submitting.current = true
    setPending(true)
    setReconciliation(null)
    const signal = lifetime.current.signal
    try {
      const band = await createBand(authenticatedRequest, name.trim(), user.userId, signal)
      if (signal.aborted) return
      if (await cacheCreatedBand(client, band, signal)) {
        allowNavigation()
        navigate(`/bands/${band.bandId}/members`, { replace: true, state: { openAddMember: true } })
      }
    } catch (error) {
      if (signal.aborted || error.code === 'AUTHENTICATION_REQUIRED' || error.name === 'AbortError') return
      if (error.code === 'VALIDATION_ERROR') {
        const details = error.details ?? []
        setFieldError(details.find((detail) => detail.field === 'name')?.message)
        if (details.some((detail) => detail.field === 'name')) setFocusRequest((value) => value + 1)
        const remaining = details.filter((detail) => detail.field !== 'name').map((detail) => detail.message)
        setFormError(remaining.join(' ') || (details.length ? null : 'Check the band name and try again.'))
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(error.retryAt ?? null)
        setFormError(error.retryAt
          ? `Too many attempts. Try again after ${new Date(error.retryAt).toLocaleTimeString()}.`
          : 'Too many attempts. Please wait before trying again.')
      } else {
        setFormError('We couldn’t confirm whether that change was saved. We’ll check the latest information before you try again.')
        setPending(false)
        await reconcile(signal)
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  return <BandShell bands={bands} context="Create a band">
    <h1>Create a band</h1>
    <form className="band-form" onSubmit={submit} noValidate>
      {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
      <label htmlFor="band-name">Band name</label>
      <input ref={field} id="band-name" name="name" value={name} disabled={pending}
        aria-invalid={Boolean(fieldError)} aria-describedby={`band-name-hint${fieldError ? ' band-name-error' : ''}`}
        onBlur={() => { setTouched(true); setFieldError(validateName(name.trim())) }}
        onChange={(event) => {
          setName(event.target.value)
          if (touched) setFieldError(validateName(event.target.value.trim()))
        }} />
      <p id="band-name-hint">1–50 characters. Bands can share the same name.</p>
      {fieldError && <p id="band-name-error">{fieldError}</p>}
      {reconciliation === 'checking' && <p role="status">Checking your bands…</p>}
      {reconciliation === 'failed' && <div role="alert">
        <p>We couldn’t check your bands. Check again before creating another band.</p>
        <button type="button" onClick={() => reconcile()}>Check again</button>
      </div>}
      {reconciliation === 'checked' && <section aria-label="Check existing bands">
        <p role="status">Your bands are up to date. Check them before trying again.</p>
        {bands.data?.length > 0 ? <BandLinks bands={bands.data} /> : <p>No bands were found.</p>}
        <p>A matching name doesn’t confirm creation. Create again could create another band, even with the same name.</p>
      </section>}
      <div className="form-actions">
        <button type="submit" disabled={pending || reconciliation === 'checking' || reconciliation === 'failed'}>
          {pending ? 'Creating band…' : reconciliation === 'checked' ? 'Create again' : 'Create band'}
        </button>
        <button type="button" disabled={pending} onClick={() => navigate(origin)}>Cancel</button>
      </div>
      {pending && !reconciliation && <p role="status">Creating band…</p>}
    </form>
    <UnsavedNavigationDialog blocker={blocker} pending={pending} />
  </BandShell>
}
