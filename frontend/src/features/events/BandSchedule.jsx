import { useEffect, useState } from 'react'
import { focusManager } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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
    <Link to={`/bands/${bandId}/events/${event.eventId}`}>
      <span>{formatLocalTime(event.startTime)}</span>{' '}
      <span>{event.name}</span>{' '}
      <span>{event.type === 'rehearsal' ? 'Rehearsal' : 'Performance'}</span>{' '}
      <span>{event.location}</span>
    </Link>
  </li>
}

function EventSection({ title, groups, bandId }) {
  const classification = title.toLowerCase()
  return <section aria-labelledby={`${classification}-events-heading`}>
    <h3 id={`${classification}-events-heading`}>{title}</h3>
    {groups.length === 0 ? <p>No {classification} events.</p> : groups.map((group) => <section key={group.date} aria-labelledby={`${classification}-events-${group.date}`}>
      <h4 id={`${classification}-events-${group.date}`}>{group.label}</h4>
      <ul aria-label={`${group.label} ${title.toLowerCase()} events`}>
        {group.events.map((event) => <EventRow key={event.eventId} bandId={bandId} event={event} />)}
      </ul>
    </section>)}
  </section>
}

export function BandSchedule({ bandId, canCreate = false }) {
  const events = useEvents(bandId)
  const [now, setNow] = useState(() => new Date())
  const groups = events.data ? groupEvents(events.data, now) : null

  useEffect(() => focusManager.subscribe(() => {
    if (focusManager.isFocused()) setNow(new Date())
  }), [])

  useEffect(() => {
    if (!events.data) return undefined
    const startBoundary = nextStartBoundary(events.data, now)
    const calendarBoundary = nextBrowserCalendarBoundary(now)
    const boundary = !startBoundary || calendarBoundary < startBoundary ? calendarBoundary : startBoundary
    const timer = window.setTimeout(() => setNow(new Date()), Math.min(Math.max(0, boundary.getTime() - Date.now()), 2147483647))
    return () => window.clearTimeout(timer)
  }, [events.data, now])

  return <>
    <h2>Schedule</h2>
    {canCreate && <Link to={`/bands/${bandId}/events/new`}>Create event</Link>}
    {events.isPending && <p role="status">Loading schedule…</p>}
    <ScheduleReadFailure query={events} />
    {groups && <>
      <EventSection title="Upcoming" groups={groups.upcoming} bandId={bandId} />
      <EventSection title="Past" groups={groups.past} bandId={bandId} />
    </>}
  </>
}
