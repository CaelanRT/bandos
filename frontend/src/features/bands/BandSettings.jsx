import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { composeValidators, maxLength, required } from '../../utils/validation.js'
import { DeleteBand } from './DeleteBand.jsx'
import { renameBand } from './api.js'
import { bandKeys, cacheSavedBand, checkBand, checkBands, clearBandResources, removeBandAccess } from './queries.js'

const validateName = composeValidators(required('Enter a band name.'), maxLength(50))

export function BandSettings({ band }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { authenticatedRequest } = useSession()
  const mutation = useMutationIntent(authenticatedRequest)
  const [name, setName] = useState(band.name)
  const [version, setVersion] = useState(band.version)
  const [baseline, setBaseline] = useState(band.name)
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, setPending] = useState(false)
  const [deletionUnresolved, setDeletionUnresolved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [permissionChecking, setPermissionChecking] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const input = useRef(null)
  const notice = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const currentBlocker = useRef(null)
  const denied = Boolean(band.managementDenied)
  const dirty = name !== baseline
  const { blocker, allowNavigation } = useUnsavedNavigation(!denied && (dirty || deleting || deletionUnresolved || mutation.unresolved))
  useEffect(() => { currentBlocker.current = blocker }, [blocker])
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  // Only untouched input follows background data. An edited draft keeps its baseline.
  if (!dirty && !mutation.locked && (baseline !== band.name || version !== band.version)) {
    setName(band.name); setBaseline(band.name); setVersion(band.version)
  }
  useEffect(() => {
    if (denied && blocker.state === 'blocked') blocker.reset()
  }, [denied, blocker])
  useEffect(() => { if (formError) notice.current?.focus() }, [formError])
  useEffect(() => { if (focusRequest && !pending) input.current?.focus() }, [focusRequest, pending])

  function acceptName(value, text) {
    setName(value); setBaseline(value); setTouched(false); setFieldError(null)
    setFormError(null); setMessage(text)
    setFocusRequest((value) => value + 1)
    if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed()
  }
  async function refreshPermission(signal = lifetime.current.signal, activity = false) {
    setPermissionChecking(true)
    const results = await Promise.allSettled([
      checkBand(client, authenticatedRequest, band.bandId, signal, activity),
      checkBands(client, authenticatedRequest, signal, activity),
    ])
    if (signal.aborted) return
    if (results.every((result) => result.status === 'fulfilled')) {
      client.setQueryData(bandKeys.detail(band.bandId), (latest) => latest ? { ...latest, managementDenied: false } : latest)
    }
    setPermissionChecking(false)
  }
  async function reloadLatest() {
    const latest = await checkBand(client, authenticatedRequest, band.bandId, lifetime.current.signal, true)
    if (lifetime.current.signal.aborted) throw new Error('Closed')
    if (latest) {
      setVersion(latest.version)
      acceptName(latest.name, 'Latest band loaded.')
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (mutation.locked && !mutation.isRetry()) return
    if (denied || deleting || deletionUnresolved || submitting.current || !dirty) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const normalized = name.trim()
    const error = validateName(normalized)
    setTouched(true); setFieldError(error); setFormError(null); setMessage(null)
    if (error) { input.current?.focus(); return }
    submitting.current = true; setPending(true)
    const signal = lifetime.current.signal
    try {
      const saved = await renameBand(mutation.request, band.bandId, { name: normalized, expectedVersion: version }, signal)
      if (signal.aborted) return
      mutation.complete()
      if (await cacheSavedBand(client, saved, signal)) { setVersion(saved.version); acceptName(saved.name, 'Band name saved.') }
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (mutation.handleError(error)) return
      if (error.code === 'BAND_NOT_FOUND') {
        await removeBandAccess(client, band.bandId, signal)
      } else if (error.code === 'LEADER_REQUIRED') {
        await clearBandResources(client, band.bandId, signal)
        if (signal.aborted) return
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
        setFormError('The request was rejected. Review your details and try again.')
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }
  const locked = pending || deleting || deletionUnresolved
  return <section className="band-settings" aria-labelledby="settings-heading">
    <h2 id="settings-heading">Settings</h2>
    {denied ? <div role="alert">
      <p>{permissionChecking ? 'Checking your permissions…' : 'We couldn’t confirm leader access. Check your permissions to continue.'}</p>
      <button type="button" disabled={permissionChecking} onClick={() => refreshPermission(undefined, true)}>Retry permissions</button>
    </div> : <form className="band-form" aria-label="Rename band" onSubmit={submit} noValidate>
      {message && <p role="status">{message}</p>}
      {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
      <MutationRecovery mutation={mutation} pending={pending} onRetry={() => submit({ preventDefault() {} })} onReload={reloadLatest} />
      <label htmlFor="band-name">Band name</label>
      <input ref={input} id="band-name" name="name" value={name} disabled={locked || mutation.locked}
        aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'band-name-error' : undefined}
        onBlur={() => { setTouched(true); setFieldError(validateName(name.trim())) }}
        onChange={(event) => {
          setName(event.target.value); setMessage(null)
          if (touched) setFieldError(validateName(event.target.value.trim()))
        }} />
      {fieldError && <p id="band-name-error">{fieldError}</p>}
      <div className="form-actions">
        <button type="submit" disabled={mutation.locked || !dirty || locked}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" disabled={pending || deleting} onClick={() => navigate(`/bands/${band.bandId}`)}>Cancel</button>
      </div>
      {pending && <p role="status">Saving band name…</p>}
    </form>}
    {!denied && <DeleteBand band={band} disabled={pending || mutation.locked}
      setPending={setDeleting} onUnresolvedChange={setDeletionUnresolved} allowNavigation={allowNavigation} onDenied={async () => {
        client.setQueryData(bandKeys.detail(band.bandId), (latest) => latest ? { ...latest, managementDenied: true } : latest)
        setName(band.name); setBaseline(band.name); setFieldError(null); setFormError(null)
        await clearBandResources(client, band.bandId, lifetime.current.signal)
        await refreshPermission()
      }} />}
    <UnsavedNavigationDialog unresolved={mutation.unresolved || deletionUnresolved} blocker={blocker} pending={pending || deleting} />
  </section>
}
