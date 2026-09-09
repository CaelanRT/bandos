import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { composeValidators, maxLength, required } from '../../utils/validation.js'
import { addBandMember } from './api.js'
import { cacheAddedMember, checkBand, checkBands, removeBandAccess } from './queries.js'
import { useCreationIntent } from './useCreationIntent.js'

const validateUsername = composeValidators(required('Enter a username.'),
  (value) => value.length < 3 ? 'Use at least 3 characters.' : undefined, maxLength(50))

export function AddBandMember({ band }) {
  const initialOpen = useCreationIntent()
  const location = useLocation()
  const client = useQueryClient()
  const { authenticatedRequest } = useSession()
  const leader = band.currentUserRole === 'leader'
  const [open, setOpen] = useState(initialOpen && leader)
  const [username, setUsername] = useState('')
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [message, setMessage] = useState(null)
  const [pending, setPending] = useState(false)
  const [reconciliation, setReconciliation] = useState(null)
  const [permission, setPermission] = useState(null)
  const [closing, setClosing] = useState(false)
  const [retryAt, setRetryAt] = useState(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const input = useRef(null)
  const trigger = useRef(null)
  const notice = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const formGeneration = useRef(0)
  const currentBlocker = useRef(null)
  const permitted = leader && !permission
  const { blocker } = useUnsavedNavigation(permitted && open && username !== '')
  useEffect(() => { currentBlocker.current = blocker }, [blocker])
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  if (!leader && open) {
    setOpen(false)
    setClosing(false)
    setUsername('')
    setTouched(false)
    setFieldError(null)
    setFormError(null)
    setReconciliation(null)
    setMessage('Your permissions changed. Only leaders can add members.')
  }
  useEffect(() => {
    if (!permitted && blocker.state === 'blocked') blocker.reset()
  }, [permitted, blocker])
  // The shell focuses route content first, including when creation intent is consumed.
  useEffect(() => {
    if (permitted && !pending && (open || focusRequest)) {
      const timer = setTimeout(() => (open ? input : trigger).current?.focus(), 0)
      return () => clearTimeout(timer)
    }
  }, [open, permitted, pending, focusRequest, location.key])
  useEffect(() => { if (formError) notice.current?.focus() }, [formError])

  function clear() {
    setUsername(''); setTouched(false); setFieldError(null); setFormError(null)
    setReconciliation(null); setFocusRequest((value) => value + 1)
  }
  function close() {
    formGeneration.current += 1
    const unresolved = ['checking', 'failed'].includes(reconciliation) ? reconciliation : null
    clear(); setReconciliation(unresolved); setOpen(false); setClosing(false)
  }
  async function refreshPermission(signal = lifetime.current.signal) {
    setPermission('checking')
    const results = await Promise.allSettled([
      checkBand(client, authenticatedRequest, band.bandId, signal),
      checkBands(client, authenticatedRequest, signal),
    ])
    if (!signal.aborted) setPermission(results.every((result) => result.status === 'fulfilled') ? null : 'failed')
  }
  async function reconcile(attemptedUsername, signal = lifetime.current.signal) {
    const generation = formGeneration.current
    setReconciliation('checking')
    try {
      const latest = await checkBand(client, authenticatedRequest, band.bandId, signal)
      if (signal.aborted || !latest) return
      if (generation !== formGeneration.current || !attemptedUsername) {
        setReconciliation(null); setFormError(null)
        return
      }
      const found = latest.members.some((member) => member.username.toLowerCase() === attemptedUsername.toLowerCase())
      setReconciliation(found ? 'found' : 'absent')
    } catch {
      if (!signal.aborted) setReconciliation('failed')
    }
  }
  async function submit(event) {
    event.preventDefault()
    if (!permitted || submitting.current || ['checking', 'failed', 'found'].includes(reconciliation)) return
    if (retryAt && Date.now() < retryAt) { notice.current?.focus(); return }
    const normalized = username.trim()
    const error = validateUsername(normalized)
    setTouched(true); setFieldError(error); setFormError(null); setMessage(null)
    if (error) { input.current?.focus(); return }
    submitting.current = true; setPending(true); setReconciliation(null)
    const signal = lifetime.current.signal
    try {
      const member = await addBandMember(authenticatedRequest, band.bandId, normalized, signal)
      if (signal.aborted) return
      if (await cacheAddedMember(client, band.bandId, member, signal)) {
        clear(); setMessage(`@${member.username} added to the band.`)
        if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed()
      }
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (error.code === 'BAND_NOT_FOUND') {
        await removeBandAccess(client, band.bandId, signal)
      } else if (error.code === 'LEADER_REQUIRED') {
        setPermission('checking'); setOpen(false); setClosing(false); clear()
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
        setFormError('We couldn’t confirm whether that change was saved. We’ll check the latest information before you try again.')
        setPending(false)
        await reconcile(normalized, signal)
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }
  const checking = reconciliation === 'checking'
  const locked = pending || checking || reconciliation === 'failed' || reconciliation === 'found'
  return <>
    {message && <p role="status">{message}</p>}
    {permission === 'checking' && <p role="status">Checking your permissions…</p>}
    {permission === 'failed' && <div role="alert">
      <p>We couldn’t check your permissions.</p>
      <button type="button" onClick={() => refreshPermission()}>Retry permissions</button>
    </div>}
    {permitted && <>
      <button ref={trigger} type="button" hidden={open} onClick={() => { setMessage(null); setOpen(true) }}>Add member</button>
      {open && <form className="band-form" aria-label="Add member" onSubmit={submit} noValidate>
        <h3>Add member</h3>
        {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
        <label htmlFor="member-username">Username</label>
        <input ref={input} id="member-username" name="username" value={username} disabled={pending || checking || reconciliation === 'failed'}
          autoCapitalize="none" autoComplete="off" spellCheck={false}
          aria-invalid={Boolean(fieldError)} aria-describedby={`member-username-hint${fieldError ? ' member-username-error' : ''}`}
          onBlur={() => { setTouched(true); setFieldError(validateUsername(username.trim())) }}
          onChange={(event) => {
            setUsername(event.target.value)
            if (touched) setFieldError(validateUsername(event.target.value.trim()))
            if (reconciliation === 'found' || reconciliation === 'absent') { setReconciliation(null); setFormError(null) }
          }} />
        <p id="member-username-hint">They need an existing Bandos account. Enter their username without @ (3–50 characters).</p>
        {fieldError && <p id="member-username-error">{fieldError}</p>}
        {checking && <p role="status">Checking band membership…</p>}
        {reconciliation === 'failed' && <div role="alert">
          <p>We couldn’t check membership. Check again before trying another addition.</p>
          <button type="button" onClick={() => reconcile(username.trim())}>Check again</button>
        </div>}
        {reconciliation === 'found' && <>
          <p role="status">That person is now in the band.</p>
          <button type="button" onClick={() => { clear(); setMessage(null) }}>Clear and add another</button>
        </>}
        {reconciliation === 'absent' && <p role="status">That username is not in the latest member list. You can try again.</p>}
        <div className="form-actions">
          <button type="submit" disabled={locked}>{pending ? 'Adding member…' : reconciliation === 'absent' ? 'Try adding again' : 'Add member'}</button>
          <button type="button" disabled={pending} onClick={() => username !== '' ? setClosing(true) : close()}>Cancel</button>
        </div>
        {pending && <p role="status">Adding member…</p>}
      </form>}
    </>}
    <UnsavedNavigationDialog pending={pending} blocker={blocker.state === 'blocked' ? blocker : {
      state: closing ? 'blocked' : 'unblocked', reset: () => setClosing(false), proceed: close,
    }} />
  </>
}
