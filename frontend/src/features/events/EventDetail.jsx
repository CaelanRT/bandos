import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { formatLocalTime, isEventEditable } from './schedule.js'
import { useEvent } from './queries.js'
import { DeleteEvent } from './DeleteEvent.jsx'

function EventReadFailure({ query }) {
  if (!query.isError) return null
  return <div role="alert">
    <p>We couldn’t {query.data ? 'update' : 'load'} this event.</p>
    <button type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
      {query.isFetching ? 'Retrying…' : 'Retry'}
    </button>
  </div>
}

export function EventDetail({ bandId, eventId, canEdit = false }) {
  const detail = useEvent(bandId, eventId)
  const event = detail.data
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
  if (event === null) return <><h1>This event is no longer available.</h1><Link to={schedule}>Back to Schedule</Link></>
  return <>
    {notice && <p role="status">{notice}</p>}
    {detail.isPending && <p role="status">Loading event…</p>}
    <EventReadFailure query={detail} />
    {event && <article>
      <h1>{event.name}</h1>
      <p>{event.type === 'rehearsal' ? 'Rehearsal' : 'Performance'}</p>
      <dl>
        <dt>Date</dt><dd>{event.date}</dd>
        <dt>Start time</dt><dd>{formatLocalTime(event.startTime)}</dd>
        <dt>End time</dt><dd>{formatLocalTime(event.endTime)}</dd>
        <dt>Timezone</dt><dd>{event.timezone}</dd>
        <dt>Location</dt><dd>{event.location}</dd>
      </dl>
      {event.description !== null && <section aria-labelledby="description-heading"><h2 id="description-heading">Description</h2><p>{event.description}</p></section>}
      {canEdit && isEventEditable(event) && <Link to={`/bands/${bandId}/events/${eventId}/edit`}>Edit event</Link>}
      {canEdit && <DeleteEvent bandId={bandId} eventId={eventId} event={event} />}
      <Link to={schedule}>Back to Schedule</Link>
    </article>}
  </>
}
