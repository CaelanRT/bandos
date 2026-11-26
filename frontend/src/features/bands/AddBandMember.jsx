import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { composeValidators, maxLength, required } from '../../utils/validation.js'
import { addBandMember } from './api.js'
import { cacheSavedBand, checkBand, checkBands, clearBandResources, removeBandAccess } from './queries.js'
import { useCreationIntent } from './useCreationIntent.js'

const validateUsername = composeValidators(required('Enter a username.'),
  (value) => value.length < 3 ? 'Use at least 3 characters.' : undefined, maxLength(50))

export function AddBandMember({ band }) {
  const creationIntent = useCreationIntent()
  const location = useLocation()
  const client = useQueryClient()
  const { authenticatedRequest } = useSession()
  const mutation = useMutationIntent(authenticatedRequest)
  const leader = band.currentUserRole === 'leader' && !band.managementDenied
  const [previousLeader, setPreviousLeader] = useState(leader)
  const [version, setVersion] = useState(band.version)
  const [username, setUsername] = useState('')
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, setPending] = useState(false)
  const [permission, setPermission] = useState(null)
  const [retryAt, setRetryAt] = useState(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const appliedFocusRequest = useRef(null)
  const input = useRef(null)
  const notice = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const currentBlocker = useRef(null)
  const permitted = leader && !permission
  const { blocker } = useUnsavedNavigation(permitted && (username !== '' || mutation.unresolved))
  useEffect(() => { currentBlocker.current = blocker }, [blocker])
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  if (username === '' && !pending && !mutation.locked && version !== band.version) setVersion(band.version)
  if (previousLeader !== leader) {
    setPreviousLeader(leader)
  }
  if (previousLeader && !leader) {
    setUsername('')
    setTouched(false)
    setFieldError(null)
    setFormError(null)
    setMessage('Your permissions changed. Only leaders can add members.')
  }
  useEffect(() => {
    if (!permitted && blocker.state === 'blocked') blocker.reset()
  }, [permitted, blocker])
  // Wait for marker removal so the shell's route focus completes before the handoff.
  useEffect(() => {
    if (location.state?.openAddMember === true) return
    if (permitted && !pending && (creationIntent || focusRequest) && appliedFocusRequest.current !== focusRequest) {
      const timer = setTimeout(() => {
        input.current?.focus()
        appliedFocusRequest.current = focusRequest
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [creationIntent, permitted, pending, focusRequest, location.key, location.state?.openAddMember])
  useEffect(() => { if (formError) notice.current?.focus() }, [formError])

  function clear() {
    setUsername(''); setTouched(false); setFieldError(null); setFormError(null)
    setFocusRequest((value) => value + 1)
  }
  async function refreshPermission(signal = lifetime.current.signal, activity = false) {
    setPermission('checking')
    const results = await Promise.allSettled([
      checkBand(client, authenticatedRequest, band.bandId, signal, activity),
      checkBands(client, authenticatedRequest, signal, activity),
    ])
    if (!signal.aborted) setPermission(results.every((result) => result.status === 'fulfilled') ? null : 'failed')
  }
  async function reloadLatest() {
    const latest = await checkBand(client, authenticatedRequest, band.bandId, lifetime.current.signal, true)
    if (lifetime.current.signal.aborted) throw new Error('Closed')
    if (latest) {
      setVersion(latest.version)
      clear()
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (mutation.locked && !mutation.isRetry()) return
    if (!permitted || submitting.current) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const normalized = username.trim()
    const error = validateUsername(normalized)
    setTouched(true); setFieldError(error); setFormError(null); setMessage(null)
    if (error) { input.current?.focus(); return }
    submitting.current = true; setPending(true)
    const signal = lifetime.current.signal
    try {
      const { member, band: savedBand } = await addBandMember(mutation.request, band.bandId, { username: normalized, expectedVersion: version }, signal)
      if (signal.aborted) return
      mutation.complete()
      if (await cacheSavedBand(client, savedBand, signal)) {
        setVersion(savedBand.version); clear(); setMessage(`@${member.username} added to the band.`)
        if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed()
      }
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (mutation.handleError(error)) return
      if (error.code === 'BAND_NOT_FOUND') {
        await removeBandAccess(client, band.bandId, signal)
      } else if (error.code === 'LEADER_REQUIRED') {
        await clearBandResources(client, band.bandId, signal)
        if (signal.aborted) return
        setPermission('checking'); clear()
        setMessage('Your permissions changed. Only leaders can add members.')
        if (blocker.state === 'blocked') blocker.reset()
        await refreshPermission(signal)
      } else if (error.code === 'USER_NOT_FOUND' || error.code === 'USER_ALREADY_IN_BAND') {
        setFieldError(error.code === 'USER_NOT_FOUND' ? 'No active account found with that username.' : 'That person is already in this band.')
        setFocusRequest((value) => value + 1)
      } else if (error.code === 'VALIDATION_ERROR') {
        const details = error.details ?? []
        setFieldError(details.find((detail) => detail.field === 'username')?.message)
        setFormError(details.filter((detail) => detail.field !== 'username').map((detail) => detail.message).join(' ') ||
          (details.length ? null : 'Check the username and try again.'))
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
  const locked = pending
  return <>
    {message && <p className="member-add-notice" role="status">{message}</p>}
    {permission === 'checking' && <p role="status">Checking your permissions…</p>}
    {permission === 'failed' && <div role="alert">
      <p>We couldn’t check your permissions.</p>
      <button type="button" onClick={() => refreshPermission(undefined, true)}>Retry permissions</button>
    </div>}
    {permitted && <form className="band-form member-add-form" aria-label="Add member" onSubmit={submit} noValidate>
      {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
      <MutationRecovery mutation={mutation} pending={pending} onRetry={() => submit({ preventDefault() {} })} onReload={reloadLatest} />
      <label htmlFor="member-username">Add band member or user</label>
      <div className="member-add-row">
        <input ref={input} id="member-username" name="username" value={username} disabled={pending || mutation.locked}
          autoCapitalize="none" autoComplete="off" spellCheck={false}
          aria-invalid={Boolean(fieldError)} aria-describedby={`member-username-hint${fieldError ? ' member-username-error' : ''}`}
          onBlur={() => { setTouched(true); setFieldError(validateUsername(username.trim())) }}
          onChange={(event) => {
            setUsername(event.target.value)
            if (touched) setFieldError(validateUsername(event.target.value.trim()))
          }} />
        <button type="submit" disabled={mutation.locked || locked}>{pending ? 'Adding member…' : 'Add member'}</button>
      </div>
      <p id="member-username-hint">They need an existing BandOS account. Enter their username without @ (3–50 characters).</p>
      {fieldError && <p id="member-username-error">{fieldError}</p>}
      {pending && <p role="status">Adding member…</p>}
    </form>}
    <UnsavedNavigationDialog unresolved={mutation.unresolved} pending={pending} blocker={blocker} />
  </>
}
