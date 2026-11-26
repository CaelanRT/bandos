import { useMutationIntent } from '../../mutations/useMutationIntent.js'
import { MutationRecovery } from '../../mutations/MutationRecovery.jsx'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { deleteBand } from './api.js'
import { checkBand, removeBandAccess } from './queries.js'

export function DeleteBand({ band, disabled, setPending, onUnresolvedChange, allowNavigation, onDenied }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { authenticatedRequest } = useSession()
  const mutation = useMutationIntent(authenticatedRequest)
  useEffect(() => { onUnresolvedChange(mutation.unresolved) }, [mutation.unresolved, onUnresolvedChange])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
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

  async function reloadLatest() {
    await checkBand(client, authenticatedRequest, band.bandId, lifetime.current.signal, true)
    if (lifetime.current.signal.aborted) throw new Error('Closed')
    setOpen(false)
  }

  async function confirm() {
    if (mutation.locked && !mutation.isRetry()) return
    if (submitting.current || disabled ||
        (retryAt && Date.now() < retryAt)) return
    submitting.current = true
    setBusy(true); setPending(true); setError(null)
    const signal = lifetime.current.signal
    try {
      await deleteBand(mutation.request, band.bandId, signal, { expectedVersion: band.version })
      if (signal.aborted) return
      mutation.complete()
      allowNavigation()
      await removeBandAccess(client, band.bandId, signal)
      navigate('/', { replace: true, state: { bandDeleted: true } })
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (mutation.handleError(failure)) return
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
          setError('The request was rejected. Please review it and try again.')
        }
      }
    } finally {
      submitting.current = false
      setPending(false)
      if (!signal.aborted) setBusy(false)
    }
  }

  return <section className="band-delete" aria-labelledby="delete-heading">
    <h3 id="delete-heading">Delete band</h3>
    {error && <p role="alert">{error}</p>}
    <button ref={trigger} className="band-delete-trigger" type="button" disabled={disabled || busy}
      onClick={() => setOpen(true)}>Delete band</button>
    {open && <dialog ref={dialog} className="band-delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-description"
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
      onCancel={(event) => { event.preventDefault(); if (!submitting.current) setOpen(false) }}>
      <h2 id="delete-title">Delete {band.name}?</h2>
      <p id="delete-description">Everyone will lose access to this band, its member list, and its events.</p>
      {busy && <p role="status">Deleting band…</p>}
      <MutationRecovery mutation={mutation} pending={busy} onRetry={() => confirm()} onReload={reloadLatest} />
      <div className="form-actions">
        <button ref={cancel} type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button className="band-delete-confirm" type="button" disabled={busy || mutation.locked} onClick={confirm}>Delete band</button>
      </div>
    </dialog>}
  </section>
}
