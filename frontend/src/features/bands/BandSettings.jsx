import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { composeValidators, maxLength, required } from '../../utils/validation.js'
import { renameBand } from './api.js'
import { bandKeys, cacheSavedBand, checkBand, checkBands, removeBandAccess } from './queries.js'

const validateName = composeValidators(required('Enter a band name.'), maxLength(50))

export function BandSettings({ band }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { authenticatedRequest } = useSession()
  const [name, setName] = useState(band.name)
  const [baseline, setBaseline] = useState(band.name)
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, setPending] = useState(false)
  const [reconciliation, setReconciliation] = useState(null)
  const [permissionChecking, setPermissionChecking] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const input = useRef(null)
  const notice = useRef(null)
  const submitting = useRef(false)
  const attemptedName = useRef(null)
  const lifetime = useRef(null)
  const currentBlocker = useRef(null)
  const denied = Boolean(band.managementDenied)
  const dirty = name !== baseline
  const { blocker } = useUnsavedNavigation(!denied && dirty)
  useEffect(() => { currentBlocker.current = blocker }, [blocker])
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  // Only untouched input follows background data. An edited draft keeps its baseline.
  if (!dirty && baseline !== band.name) {
    setName(band.name); setBaseline(band.name)
  }
  useEffect(() => {
    if (denied && blocker.state === 'blocked') blocker.reset()
  }, [denied, blocker])
  useEffect(() => { if (formError) notice.current?.focus() }, [formError])
  useEffect(() => { if (focusRequest && !pending) input.current?.focus() }, [focusRequest, pending])

  function acceptName(value, text) {
    setName(value); setBaseline(value); setTouched(false); setFieldError(null)
    setFormError(null); setReconciliation(null); setMessage(text)
    setFocusRequest((value) => value + 1)
    if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed()
  }
  async function refreshPermission(signal = lifetime.current.signal) {
    setPermissionChecking(true)
    const results = await Promise.allSettled([
      checkBand(client, authenticatedRequest, band.bandId, signal),
      checkBands(client, authenticatedRequest, signal),
    ])
    if (signal.aborted) return
    if (results.every((result) => result.status === 'fulfilled')) {
      client.setQueryData(bandKeys.detail(band.bandId), (latest) => latest ? { ...latest, managementDenied: false } : latest)
    }
    setPermissionChecking(false)
  }
  async function reconcile(signal = lifetime.current.signal) {
    setReconciliation('checking')
    try {
      const latest = await checkBand(client, authenticatedRequest, band.bandId, signal)
      if (signal.aborted || !latest) return
      if (latest.currentUserRole !== 'leader') return
      await cacheSavedBand(client, latest, signal)
      if (signal.aborted) return
      if (latest.name === attemptedName.current) {
        acceptName(latest.name, 'The current band name matches your change.')
      } else {
        setReconciliation('conflict')
        setFormError(null)
      }
    } catch {
      if (!signal.aborted) setReconciliation('failed')
    }
  }
  async function submit(event) {
    event.preventDefault()
    if (denied || submitting.current || !dirty || ['checking', 'failed'].includes(reconciliation)) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const normalized = name.trim()
    const error = validateName(normalized)
    setTouched(true); setFieldError(error); setFormError(null); setMessage(null)
    if (error) { input.current?.focus(); return }
    submitting.current = true; setPending(true); setReconciliation(null)
    attemptedName.current = normalized
    const signal = lifetime.current.signal
    try {
      const saved = await renameBand(authenticatedRequest, band.bandId, normalized, signal)
      if (signal.aborted) return
      if (await cacheSavedBand(client, saved, signal)) acceptName(saved.name, 'Band name saved.')
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (error.code === 'BAND_NOT_FOUND') {
        await removeBandAccess(client, band.bandId, signal)
      } else if (error.code === 'LEADER_REQUIRED') {
        client.setQueryData(bandKeys.detail(band.bandId), (latest) => latest ? { ...latest, managementDenied: true } : latest)
        setName(band.name); setBaseline(band.name); setFieldError(null); setFormError(null)
        await refreshPermission(signal)
      } else if (error.code === 'VALIDATION_ERROR') {
        const details = error.details ?? []
        setFieldError(details.find((detail) => detail.field === 'name')?.message)
        setFormError(details.filter((detail) => detail.field !== 'name').map((detail) => detail.message).join(' ') ||
          (details.length ? null : 'Check the band name and try again.'))
        setFocusRequest((value) => value + 1)
      } else if (error.code === 'TOO_MANY_ATTEMPTS') {
        setRetryAt(error.retryAt ?? null)
        setFormError(error.retryAt ? `Too many attempts. Try again after ${new Date(error.retryAt).toLocaleTimeString()}.` :
          'Too many attempts. Please wait before trying again.')
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
  const checking = reconciliation === 'checking'
  const locked = pending || checking || reconciliation === 'failed'
  return <section aria-labelledby="settings-heading">
    <h2 id="settings-heading">Settings</h2>
    {denied ? <div role="alert">
      <p>{permissionChecking ? 'Checking your permissions…' : 'We couldn’t confirm leader access. Check your permissions to continue.'}</p>
      <button type="button" disabled={permissionChecking} onClick={() => refreshPermission()}>Retry permissions</button>
    </div> : <form className="band-form" aria-label="Rename band" onSubmit={submit} noValidate>
      {message && <p role="status">{message}</p>}
      {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
      <label htmlFor="band-name">Band name</label>
      <input ref={input} id="band-name" name="name" value={name} disabled={locked}
        aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'band-name-error' : undefined}
        onBlur={() => { setTouched(true); setFieldError(validateName(name.trim())) }}
        onChange={(event) => {
          setName(event.target.value); setMessage(null)
          if (touched) setFieldError(validateName(event.target.value.trim()))
        }} />
      {fieldError && <p id="band-name-error">{fieldError}</p>}
      {checking && <p role="status">Checking the band name…</p>}
      {reconciliation === 'failed' && <div role="alert">
        <p>We couldn’t check the band name. Check again before saving.</p>
        <button type="button" onClick={() => reconcile()}>Check again</button>
      </div>}
      {reconciliation === 'conflict' && <p role="status">The current server name is “{band.name}”. Your draft is preserved; save again to retry.</p>}
      <div className="form-actions">
        <button type="submit" disabled={!dirty || locked}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" disabled={pending} onClick={() => navigate(`/bands/${band.bandId}`)}>Cancel</button>
      </div>
      {pending && <p role="status">Saving band name…</p>}
    </form>}
    <UnsavedNavigationDialog blocker={blocker} pending={pending} />
  </section>
}
