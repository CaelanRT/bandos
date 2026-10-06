import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../../app/sessionContext.js'
import { bandKeys, checkBand, checkBands, removeBandAccess } from '../bands/queries.js'
import { deleteEvent } from './api.js'
import { cacheDeletedEvent } from './queries.js'

export function DeleteEvent({ bandId, eventId, event, disabled = false, editHref = null }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { authenticatedRequest } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menu = useRef(null)
  const firstItem = useRef(null)
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

  useLayoutEffect(() => {
    if (menuOpen) firstItem.current?.focus()
  }, [menuOpen, editHref])
  useEffect(() => {
    if (!menuOpen) return
    function dismiss(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && menu.current?.contains(event.target)) return
      if (event.type === 'keydown') event.preventDefault()
      setMenuOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [menuOpen])

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

  return <section className="event-management" aria-label="Event management">
    {error && !open && <p className="event-notice" role="alert">{error}</p>}
    {permissionState && <div className="event-notice" role="alert">
      <p>{permissionState === 'checking' ? 'Checking your permissions…' : 'We couldn’t confirm leader access.'}</p>
      {permissionState === 'failed' && <button type="button" onClick={() => refreshPermission()}>Retry permissions</button>}
    </div>}
    <div ref={menu} className="event-menu" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false)
    }}>
      <button ref={trigger} className="event-menu-trigger" type="button" aria-label="Event settings"
        aria-expanded={menuOpen} aria-controls={menuId} disabled={disabled || busy || Boolean(permissionState)}
        onClick={() => setMenuOpen(!menuOpen)} onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (menuOpen) firstItem.current?.focus()
            else setMenuOpen(true)
          }
        }}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="m9 3-.6 2.4-2 .9L4.2 6 2 10l1.8 1.6v.8L2 14l2.2 4 2.2-.3 2 .9L9 21h6l.6-2.4 2-.9 2.2.3 2.2-4-1.8-1.6v-.8L22 10l-2.2-4-2.2.3-2-.9L15 3Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <div id={menuId} className="event-menu-panel" hidden={!menuOpen}>
        {editHref && <Link ref={firstItem} to={editHref} onClick={() => setMenuOpen(false)}>Edit Event</Link>}
        <button ref={editHref ? undefined : firstItem} className="event-delete-trigger" type="button"
          onClick={() => { setMenuOpen(false); setError(null); setOpen(true) }}>Delete Event</button>
      </div>
    </div>
    {open && <dialog ref={dialog} className="event-delete-dialog" aria-labelledby="delete-event-title" aria-describedby="delete-event-description"
      onKeyDown={(keyEvent) => { if (keyEvent.key === 'Escape') keyEvent.stopPropagation() }}
      onCancel={(cancelEvent) => { cancelEvent.preventDefault(); if (!submitting.current) setOpen(false) }}>
      <h2 id="delete-event-title">Delete {event.name}?</h2>
      <p id="delete-event-description">This event will no longer be available to the band.</p>
      {busy && <p className="event-notice" role="status">Deleting event…</p>}
      {error && <p className="event-notice" role="alert">{error}</p>}
      <div className="form-actions">
        <button ref={cancel} type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button className="event-delete-confirm" type="button" disabled={busy} onClick={confirm}>Delete event</button>
      </div>
    </dialog>}
  </section>
}
