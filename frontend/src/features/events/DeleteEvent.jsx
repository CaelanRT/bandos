import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../app/sessionContext.js'
import { bandKeys, checkBand, checkBands, removeBandAccess } from '../bands/queries.js'
import { deleteEvent } from './api.js'
import { cacheDeletedEvent } from './queries.js'

export function DeleteEvent({ bandId, eventId, event, disabled = false }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { authenticatedRequest } = useSession()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [permissionState, setPermissionState] = useState(null)
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
    if (!open) return undefined
    const element = dialog.current
    const previous = trigger.current
    element.showModal()
    cancel.current.focus()
    return () => {
      element.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  async function refreshPermission(signal = lifetime.current.signal) {
    setPermissionState('checking')
    const results = await Promise.allSettled([
      checkBand(client, authenticatedRequest, bandId, signal),
      checkBands(client, authenticatedRequest, signal),
    ])
    if (signal.aborted) return
    if (!results.every((result) => result.status === 'fulfilled')) {
      setPermissionState('failed')
      return
    }
    setPermissionState(null)
    if (results[0].value?.currentUserRole === 'leader') {
      client.setQueryData(bandKeys.detail(bandId), (current) => current ? { ...current, managementDenied: false } : current)
      setError('Your leader access is confirmed. You can try deleting the event again.')
    } else {
      client.setQueryData(bandKeys.detail(bandId), (current) => current ? { ...current, managementDenied: true } : current)
      navigate(`/bands/${bandId}`, { replace: true, state: { eventManagementPermissionNotice: true } })
    }
  }

  async function confirm() {
    if (submitting.current || disabled || permissionState || busy) return
    submitting.current = true
    setBusy(true)
    setError(null)
    const signal = lifetime.current.signal
    try {
      await deleteEvent(authenticatedRequest, bandId, eventId, signal)
      if (signal.aborted) return
      if (await cacheDeletedEvent(client, bandId, eventId, signal)) {
        navigate(`/bands/${bandId}`, { replace: true, state: { eventDeleted: true } })
      }
    } catch (failure) {
      if (signal.aborted || failure.name === 'AbortError' || failure.code === 'AUTHENTICATION_REQUIRED') return
      if (failure.code === 'BAND_NOT_FOUND') {
        await removeBandAccess(client, bandId, signal)
      } else if (failure.code === 'EVENT_NOT_FOUND' || failure.code === 'NOT_FOUND') {
        await cacheDeletedEvent(client, bandId, eventId, signal)
        setOpen(false)
      } else if (failure.code === 'LEADER_REQUIRED') {
        client.setQueryData(bandKeys.detail(bandId), (current) => current ? { ...current, managementDenied: true } : current)
        await refreshPermission(signal)
      } else {
        setError(failure.code === 'VALIDATION_ERROR'
          ? 'The event could not be deleted. Try again.'
          : 'We couldn’t confirm that the event was deleted. It may still be available.')
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setBusy(false)
    }
  }

  return <section aria-label="Event management">
    {error && !open && <p role="alert">{error}</p>}
    {permissionState && <div role="alert">
      <p>{permissionState === 'checking' ? 'Checking your permissions…' : 'We couldn’t confirm leader access.'}</p>
      {permissionState === 'failed' && <button type="button" onClick={() => refreshPermission()}>Retry permissions</button>}
    </div>}
    <button ref={trigger} type="button" disabled={disabled || busy || Boolean(permissionState)}
      onClick={() => { setError(null); setOpen(true) }}>Delete event</button>
    {open && <dialog ref={dialog} aria-labelledby="delete-event-title" aria-describedby="delete-event-description"
      onKeyDown={(keyEvent) => { if (keyEvent.key === 'Escape') keyEvent.stopPropagation() }}
      onCancel={(cancelEvent) => { cancelEvent.preventDefault(); if (!submitting.current) setOpen(false) }}>
      <h2 id="delete-event-title">Delete {event.name}?</h2>
      <p id="delete-event-description">This event will no longer be available to the band.</p>
      {busy && <p role="status">Deleting event…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button ref={cancel} type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" disabled={busy} onClick={confirm}>Delete event</button>
      </div>
    </dialog>}
  </section>
}
