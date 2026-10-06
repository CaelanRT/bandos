import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { formatEventDate, formatLocalTime, isEventEditable, nextStartBoundary } from './schedule.js'
import { useEvent } from './queries.js'
import { DeleteEvent } from './DeleteEvent.jsx'

function EventReadFailure({ query }) {
  if (!query.isError) return null
  return <div className="event-notice" role="alert">
    <p>We couldn’t {query.data ? 'update' : 'load'} this event.</p>
    <button type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
      {query.isFetching ? 'Retrying…' : 'Retry'}
    </button>
  </div>
}

export function EventDetail({ bandId, eventId, canEdit = false }) {
  const detail = useEvent(bandId, eventId)
  const event = detail.data
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!event) return
    const boundary = nextStartBoundary([event])
    if (!boundary) return
    const timer = window.setTimeout(() => setNow(new Date()), Math.min(Math.max(0, boundary.getTime() - Date.now()), 2147483647))
    return () => window.clearTimeout(timer)
  }, [event, now])
  const schedule = `/bands/${bandId}`
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState(() => location.state?.eventCreated ? 'Event created.' :
      location.state?.eventSaved ? 'Event saved.' :
      location.state?.eventPermissionNotice ? 'Only band leaders can edit events.' :
        location.state?.eventManagementPermissionNotice ? 'Only band leaders can manage events.' :
        location.state?.eventEditingClosed ? 'This event has already started and can no longer be edited.' : null)
  useEffect(() => {
    if (!location.state?.eventCreated && !location.state?.eventSaved && !location.state?.eventPermissionNotice &&
        !location.state?.eventManagementPermissionNotice && !location.state?.eventEditingClosed) return
    const { eventCreated: _created, eventSaved: _saved, eventPermissionNotice: _permission,
      eventManagementPermissionNotice: _managementPermission, eventEditingClosed: _closed, ...state } = location.state
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
  }, [location, navigate])
  if (detail.error?.code === 'BAND_NOT_FOUND') return <p className="event-notice" role="status">Checking band access…</p>
  if (event === null) return <div className="event-recovery"><h1>This event is no longer available.</h1><Link to={schedule}>Back to Schedule</Link></div>
  return <div className="event-detail">
    {notice && <p className="event-notice" role="status">{notice}</p>}
    {detail.isPending && <p className="event-notice" role="status">Loading event…</p>}
    <EventReadFailure query={detail} />
    {event && <article>
      <header className="event-detail-heading">
        <div className="event-detail-title">
          <h1>{event.name}</h1>
          {canEdit && <DeleteEvent bandId={bandId} eventId={eventId} event={event}
            editHref={isEventEditable(event) ? `/bands/${bandId}/events/${eventId}/edit` : null} />}
        </div>
        <p>{event.type === 'rehearsal' ? 'Rehearsal' : 'Performance'}</p>
      </header>
      <Link className="event-detail-back" to={schedule}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M20 12H4m7-7-7 7 7 7" />
        </svg>
        Back
      </Link>
      <dl className="event-detail-facts">
        <div><dt>Date</dt><dd><time dateTime={event.date}>{formatEventDate(event.date)}</time></dd></div>
        <div><dt>Start time</dt><dd><time dateTime={event.startTime}>{formatLocalTime(event.startTime)}</time></dd></div>
        <div><dt>End time</dt><dd><time dateTime={event.endTime}>{formatLocalTime(event.endTime)}</time></dd></div>
        <div><dt>Timezone</dt><dd>{event.timezone}</dd></div>
        <div><dt>Location</dt><dd>{event.location}</dd></div>
      </dl>
      {event.description !== null && <section className="event-description" aria-labelledby="description-heading"><h2 id="description-heading">Description</h2><p>{event.description}</p></section>}
    </article>}
  </div>
}
