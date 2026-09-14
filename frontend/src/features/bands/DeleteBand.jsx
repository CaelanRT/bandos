import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { deleteBand } from './api.js'
import { checkBand, checkBands, removeBandAccess } from './queries.js'

export function DeleteBand({ band, disabled, setPending, allowNavigation, onDenied }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { authenticatedRequest } = useSession()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reconciliation, setReconciliation] = useState(null)
  const [error, setError] = useState(null)
  const [retryAt, setRetryAt] = useState(null)
  const dialog = useRef(null)
  const cancel = useRef(null)
  const trigger = useRef(null)
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
    cancel.current.focus()
    return () => {
      element.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  async function reconcile(signal = lifetime.current.signal) {
    setReconciliation('checking')
    const results = await Promise.allSettled([
      checkBand(client, authenticatedRequest, band.bandId, signal),
      checkBands(client, authenticatedRequest, signal),
    ])
    if (signal.aborted) return
    setReconciliation(results.every((result) => result.status === 'fulfilled') ? 'checked' : 'failed')
  }

  async function confirm() {
    if (submitting.current || disabled || ['checking', 'failed'].includes(reconciliation) ||
        (retryAt && Date.now() < retryAt)) return
    submitting.current = true
    setBusy(true); setPending(true); setError(null)
    const signal = lifetime.current.signal
    try {
      await deleteBand(authenticatedRequest, band.bandId, signal)
      if (signal.aborted) return
      allowNavigation()
      await removeBandAccess(client, band.bandId, signal)
      navigate('/', { replace: true, state: { bandDeleted: true } })
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (failure.code === 'BAND_NOT_FOUND') {
        await removeBandAccess(client, band.bandId, signal)
      } else if (failure.code === 'LEADER_REQUIRED') {
        // Permission recovery belongs to Settings and must survive this dialog closing.
        await onDenied(signal)
      } else {
        setOpen(false)
        if (failure.code === 'TOO_MANY_ATTEMPTS') {
          setRetryAt(failure.retryAt ?? null)
          setError(failure.retryAt ? `Too many attempts. Try again after ${new Date(failure.retryAt).toLocaleTimeString()}.` :
            'Too many attempts. Please wait before trying again.')
        } else if (failure.code === 'VALIDATION_ERROR') {
          setError('The band could not be deleted. Check the band and try again.')
        } else {
          setError('We couldn’t confirm whether that change was saved. We’ll check the latest information before you try again.')
          await reconcile(signal)
        }
      }
    } finally {
      submitting.current = false
      setPending(false)
      if (!signal.aborted) setBusy(false)
    }
  }

  return <section aria-labelledby="delete-heading">
    <h3 id="delete-heading">Delete band</h3>
    {error && <p role="alert">{error}</p>}
    {reconciliation === 'checking' && <p role="status">Checking whether this band is still available…</p>}
    {reconciliation === 'checked' && <p role="status">This band is still available. You can open the confirmation to try again.</p>}
    {reconciliation === 'failed' && <div role="alert">
      <p>We couldn’t check the latest band information. Check again before deleting.</p>
      <button type="button" onClick={() => reconcile()}>Check again</button>
    </div>}
    <button ref={trigger} type="button" disabled={disabled || busy || ['checking', 'failed'].includes(reconciliation)}
      onClick={() => setOpen(true)}>Delete band</button>
    {open && <dialog ref={dialog} aria-labelledby="delete-title" aria-describedby="delete-description"
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
      onCancel={(event) => { event.preventDefault(); if (!submitting.current) setOpen(false) }}>
      <h2 id="delete-title">Delete {band.name}?</h2>
      <p id="delete-description">Everyone will lose access to this band, its member list, and its events.</p>
      {busy && <p role="status">Deleting band…</p>}
      <div className="form-actions">
        <button ref={cancel} type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" disabled={busy} onClick={confirm}>Delete band</button>
      </div>
    </dialog>}
  </section>
}
