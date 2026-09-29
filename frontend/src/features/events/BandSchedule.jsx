import { useEffect, useState } from 'react'
import { focusManager } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { formatLocalTime, groupEvents, nextBrowserCalendarBoundary, nextStartBoundary } from './schedule.js'
import { useEvents } from './queries.js'

function ScheduleReadFailure({ query }) {
  if (!query.isError) return null
  return <div role="alert">
    <p>We couldn’t {query.data ? 'update' : 'load'} this schedule.</p>
    <button type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
      {query.isFetching ? 'Retrying…' : 'Retry'}
    </button>
  </div>
}

function EventRow({ bandId, event }) {
  return <li>
    <Link className="schedule-event" to={`/bands/${bandId}/events/${event.eventId}`}>
      <time dateTime={`${event.date}T${event.startTime}`}>{formatLocalTime(event.startTime)}</time>
      <strong>{event.name}</strong>
      <span className="schedule-event-type">{event.type === 'rehearsal' ? 'Rehearsal' : 'Performance'}</span>
      <span className="schedule-event-location">{event.location}</span>
    </Link>
  </li>
}

function EventSection({ title, groups, bandId }) {
  const classification = title.toLowerCase()
  return <section className="schedule-section" aria-labelledby={`${classification}-events-heading`}>
    <h3 id={`${classification}-events-heading`}>{title}</h3>
    {groups.length === 0 ? <p className="schedule-empty">No {classification} events.</p> : groups.map((group) => <section className="schedule-group" key={group.date} aria-labelledby={`${classification}-events-${group.date}`}>
      <h4 id={`${classification}-events-${group.date}`}>{group.label}</h4>
      <ul aria-label={`${group.label} ${title.toLowerCase()} events`}>
        {group.events.map((event) => <EventRow key={event.eventId} bandId={bandId} event={event} />)}
      </ul>
    </section>)}
  </section>
}

export function BandSchedule({ bandId, canCreate = false }) {
  const events = useEvents(bandId)
  const location = useLocation()
  const navigate = useNavigate()
  const [deletedNotice, setDeletedNotice] = useState(() => location.state?.eventDeleted === true)
  const [now, setNow] = useState(() => new Date())
  const groups = events.data ? groupEvents(events.data, now) : null

  useEffect(() => focusManager.subscribe(() => {
    if (focusManager.isFocused()) setNow(new Date())
  }), [])

  useEffect(() => {
    if (!location.state?.eventDeleted) return
    const { eventDeleted: _deleted, ...state } = location.state
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
  }, [location, navigate])

  useEffect(() => {
    if (!events.data) return undefined
    const startBoundary = nextStartBoundary(events.data, now)
    const calendarBoundary = nextBrowserCalendarBoundary(now)
    const boundary = !startBoundary || calendarBoundary < startBoundary ? calendarBoundary : startBoundary
    const timer = window.setTimeout(() => setNow(new Date()), Math.min(Math.max(0, boundary.getTime() - Date.now()), 2147483647))
    return () => window.clearTimeout(timer)
  }, [events.data, now])

  return <div className="band-schedule">
    <div className="schedule-heading"><h2>Schedule</h2>
      {canCreate && <Link to={`/bands/${bandId}/events/new`}>Create event</Link>}</div>
    {deletedNotice && <p className="schedule-notice" role="status">Event deleted. <button type="button" onClick={() => setDeletedNotice(false)}>Dismiss</button></p>}
    {events.isPending && <p className="schedule-message" role="status">Loading schedule…</p>}
    <div className="schedule-notice"><ScheduleReadFailure query={events} /></div>
    {groups && <>
      <EventSection title="Upcoming" groups={groups.upcoming} bandId={bandId} />
      <EventSection title="Past" groups={groups.past} bandId={bandId} />
    </>}
  </div>
}
