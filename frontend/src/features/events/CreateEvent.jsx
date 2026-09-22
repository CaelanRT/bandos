import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../app/sessionContext.js'
import { UnsavedNavigationDialog } from '../../app/UnsavedNavigation.jsx'
import { useUnsavedNavigation } from '../../app/useUnsavedNavigation.js'
import { bandKeys, checkBand, checkBands, removeBandAccess } from '../bands/queries.js'
import { createEvent } from './api.js'
import { cacheCreatedEvent } from './queries.js'
import { emptyEventValues, eventFieldNames, eventTimezoneOptions, normalizeEventValues, timezoneLabel, validateEventValues } from './eventForm.js'

const timezoneOptions = eventTimezoneOptions()

export function CreateEvent({ band }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { authenticatedRequest } = useSession()
  const [values, setValues] = useState(emptyEventValues)
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [permissionChecking, setPermissionChecking] = useState(false)
  const [permissionFailed, setPermissionFailed] = useState(() => Boolean(band.managementDenied))
  const fields = useRef({})
  const notice = useRef(null)
  const submitting = useRef(false)
  const lifetime = useRef(null)
  const dirty = JSON.stringify(normalizeEventValues(values)) !== JSON.stringify(normalizeEventValues(emptyEventValues))
  const { blocker, allowNavigation } = useUnsavedNavigation(dirty)

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  useEffect(() => { if (formError) notice.current?.focus() }, [formError])

  function validate(nextValues, changed) {
    const next = validateEventValues(nextValues)
    setErrors(() => Object.fromEntries(Object.entries(next).filter(([field]) => touched[field] || changed === null || field === changed)))
    return next
  }
  function change(field, value) {
    const next = { ...values, [field]: value }
    setValues(next); setFormError(null); setUncertain(false)
    if (touched[field]) validate(next, field)
  }
  function blur(field) {
    setTouched((current) => ({ ...current, [field]: true }))
    const next = validateEventValues(values)
    setErrors((current) => ({ ...current, ...(next[field] ? { [field]: next[field] } : { [field]: undefined }) }))
  }
  async function refreshPermission(signal = lifetime.current.signal) {
    setPermissionChecking(true); setPermissionFailed(false)
    const results = await Promise.allSettled([
      checkBand(client, authenticatedRequest, band.bandId, signal),
      checkBands(client, authenticatedRequest, signal),
    ])
    if (signal.aborted) return
    setPermissionChecking(false)
    if (!results.every((result) => result.status === 'fulfilled')) {
      setPermissionFailed(true)
      return
    }
    const latest = results[0].value
    if (latest?.currentUserRole === 'leader') {
      client.setQueryData(bandKeys.detail(band.bandId), (current) => current ? { ...current, managementDenied: false } : current)
      return
    }
    allowNavigation()
    navigate(`/bands/${band.bandId}`, { replace: true, state: { eventPermissionNotice: true } })
  }
  async function submit(event) {
    event.preventDefault()
    if (submitting.current || permissionChecking || permissionFailed) return
    const nextErrors = validateEventValues(values)
    setTouched(Object.fromEntries(eventFieldNames.map((field) => [field, true])))
    setErrors(nextErrors); setFormError(null)
    const invalid = eventFieldNames.find((field) => nextErrors[field])
    if (invalid) { fields.current[invalid]?.focus(); return }
    submitting.current = true; setPending(true); setUncertain(false)
    const signal = lifetime.current.signal
    try {
      const created = await createEvent(authenticatedRequest, band.bandId, normalizeEventValues(values), signal)
      if (signal.aborted) return
      if (await cacheCreatedEvent(client, created, signal)) {
        allowNavigation()
        navigate(`/bands/${band.bandId}/events/${created.eventId}`, { replace: true, state: { eventCreated: true } })
      }
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError' || error.code === 'AUTHENTICATION_REQUIRED') return
      if (error.code === 'BAND_NOT_FOUND') {
        await removeBandAccess(client, band.bandId, signal)
      } else if (error.code === 'LEADER_REQUIRED') {
        client.setQueryData(bandKeys.detail(band.bandId), (latest) => latest ? { ...latest, managementDenied: true } : latest)
        await refreshPermission(signal)
      } else if (error.code === 'VALIDATION_ERROR') {
        const details = error.details ?? []
        const mapped = Object.fromEntries(details.filter((detail) => eventFieldNames.includes(detail.field)).map((detail) => [detail.field, detail.message]))
        setErrors((current) => ({ ...current, ...mapped }))
        setFormError(details.filter((detail) => !eventFieldNames.includes(detail.field)).map((detail) => detail.message).join(' ') ||
          (details.length ? null : 'Check the event details and try again.'))
        fields.current[eventFieldNames.find((field) => mapped[field])]?.focus()
      } else {
        setUncertain(true)
        setFormError('We couldn’t confirm whether this event was created. Your details are still here.')
      }
    } finally {
      submitting.current = false
      if (!signal.aborted) setPending(false)
    }
  }
  const locked = pending || permissionChecking || permissionFailed
  const fieldProps = (field) => ({
    ref: (element) => { fields.current[field] = element }, name: field, value: values[field], disabled: locked,
    'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `${field}-error` : undefined,
    onChange: (event) => change(field, event.target.value), onBlur: () => blur(field),
  })
  return <section aria-labelledby="create-event-heading">
    <h2 id="create-event-heading">Create event</h2>
    {(permissionChecking || permissionFailed) ? <div role="alert">
      <p>{permissionChecking ? 'Checking your permissions…' : 'We couldn’t confirm leader access. Check your permissions to continue.'}</p>
      {permissionFailed && <button type="button" onClick={() => refreshPermission()}>Retry permissions</button>}
    </div> : <form className="band-form" onSubmit={submit} noValidate>
      {formError && <p ref={notice} role="alert" tabIndex="-1">{formError}</p>}
      <label htmlFor="event-name">Name</label>
      <input id="event-name" {...fieldProps('name')} />{errors.name && <p id="name-error">{errors.name}</p>}
      <label htmlFor="event-type">Type</label>
      <select id="event-type" {...fieldProps('type')}><option value="">Choose a type</option><option value="rehearsal">Rehearsal</option><option value="performance">Performance</option></select>{errors.type && <p id="type-error">{errors.type}</p>}
      <label htmlFor="event-date">Date</label>
      <input id="event-date" type="date" {...fieldProps('date')} />{errors.date && <p id="date-error">{errors.date}</p>}
      <label htmlFor="event-start-time">Start time</label>
      <input id="event-start-time" type="time" step="60" {...fieldProps('startTime')} />{errors.startTime && <p id="startTime-error">{errors.startTime}</p>}
      <label htmlFor="event-end-time">End time</label>
      <input id="event-end-time" type="time" step="60" {...fieldProps('endTime')} />{errors.endTime && <p id="endTime-error">{errors.endTime}</p>}
      <label htmlFor="event-timezone">Timezone</label>
      <input id="event-timezone" list="event-timezones" autoComplete="off" {...fieldProps('timezone')} />
      <datalist id="event-timezones">{timezoneOptions.map((timezone) => <option key={timezone} value={timezone} label={timezoneLabel(timezone)} />)}</datalist>
      <p id="event-timezone-hint">Search for a timezone and select its IANA name.</p>{errors.timezone && <p id="timezone-error">{errors.timezone}</p>}
      <label htmlFor="event-location">Location</label>
      <input id="event-location" {...fieldProps('location')} />{errors.location && <p id="location-error">{errors.location}</p>}
      <label htmlFor="event-description">Description (optional)</label>
      <textarea id="event-description" {...fieldProps('description')} />{errors.description && <p id="description-error">{errors.description}</p>}
      {uncertain && <p role="status">Creating again may create a duplicate event.</p>}
      <div className="form-actions">
        <button type="submit" disabled={locked}>{pending ? 'Creating event…' : uncertain ? 'Create again' : 'Create event'}</button>
        <button type="button" disabled={locked} onClick={() => navigate(`/bands/${band.bandId}`)}>Cancel</button>
      </div>
      {pending && <p role="status">Creating event…</p>}
    </form>}
    <UnsavedNavigationDialog blocker={blocker} pending={pending} />
  </section>
}
