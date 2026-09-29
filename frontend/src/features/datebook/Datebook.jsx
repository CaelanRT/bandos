import { useEffect, useState } from 'react'
import { focusManager } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatLocalTime, nextBrowserCalendarBoundary } from '../events/schedule.js'
import { useUpcomingAcrossBands } from './queries.js'
import { groupDatebookEvents } from './grouping.js'

function EventLink({ entry, featured = false }) {
  const { band, event } = entry
  return <Link className={featured ? 'datebook-event datebook-featured' : 'datebook-event'}
    to={`/bands/${band.bandId}/events/${event.eventId}`}>
    <span className="datebook-event-time"><time dateTime={event.date}>{event.date}</time><span className="datebook-event-separator"> · </span><time dateTime={event.startTime}>{formatLocalTime(event.startTime)}</time></span>
    <strong className="datebook-event-name">{event.name}</strong>
    <span className="datebook-event-band">{band.name} · {event.type === 'rehearsal' ? 'Rehearsal' : 'Performance'}</span>
    <span className="datebook-event-place">{event.location}</span>
  </Link>
}

function FailedBands({ failures }) {
  if (failures.length === 0) return null
  return <div className="datebook-alert" role="alert">
    <p>Couldn’t load events for {failures.map(({ band }) => band.name).join(', ')}.</p>
    <ul>{failures.map(({ band, retry, isFetching }) => <li key={band.bandId}>
      {band.name}{' '}
      <button type="button" disabled={isFetching} onClick={() => retry()}>
        {isFetching ? 'Retrying…' : `Retry ${band.name}`}
      </button>
    </li>)}</ul>
  </div>
}

export function Datebook() {
  const [now, setNow] = useState(() => new Date())
  const datebook = useUpcomingAcrossBands(now)
  const nextStart = datebook.events[0]?.start.getTime()

  useEffect(() => focusManager.subscribe(() => {
    if (focusManager.isFocused()) setNow(new Date())
  }), [])

  useEffect(() => {
    const midnight = nextBrowserCalendarBoundary(now).getTime()
    const boundary = nextStart === undefined ? midnight : Math.min(nextStart, midnight)
    const timer = window.setTimeout(() => setNow(new Date()), Math.min(Math.max(0, boundary - Date.now()), 2147483647))
    return () => window.clearTimeout(timer)
  }, [nextStart, now])

  if (datebook.status === 'loading') return <p className="datebook-message" role="status">Loading datebook…</p>

  if (datebook.bands.isError && !datebook.bands.data) return <div className="datebook-message datebook-alert" role="alert">
    <p>We couldn’t load your datebook.</p>
    <button type="button" disabled={datebook.bands.isFetching} onClick={() => datebook.bands.refetch()}>
      {datebook.bands.isFetching ? 'Retrying…' : 'Retry'}
    </button>
  </div>

  const [featured, ...later] = datebook.events
  const groups = groupDatebookEvents(later, now)
  if (datebook.status === 'error') return <div className="datebook-message">
    <p role="alert">We couldn’t load your datebook. Retry a band below.</p>
    <FailedBands failures={datebook.failedBands} />
  </div>

  return <div className="datebook">
    {featured ? <>
      <section className="datebook-next" aria-labelledby="next-event-heading">
        <h2 id="next-event-heading">Next event</h2>
        <EventLink entry={featured} featured />
      </section>
      {groups.length > 0 && <section className="datebook-later" aria-labelledby="later-events-heading">
        <h2 id="later-events-heading">Later events</h2>
        {groups.map((group, index) => <section className="datebook-group" key={index} aria-labelledby={`datebook-date-${index}`}>
          <h3 id={`datebook-date-${index}`}>{group.label}</h3>
          <ul>{group.events.map((entry) => <li key={`${entry.band.bandId}-${entry.event.eventId}`}>
            <EventLink entry={entry} />
          </li>)}</ul>
        </section>)}
      </section>}
    </> : datebook.bands.data?.length === 0 ? null : <div className="datebook-empty">
      <p>No upcoming events.</p>
      {datebook.bands.data && <nav aria-label="Band schedules">
        <ul>{datebook.bands.data.map((band) => <li key={band.bandId}>
          <Link to={`/bands/${band.bandId}`}>{band.name} schedule</Link>
        </li>)}</ul>
      </nav>}
    </div>}
    <FailedBands failures={datebook.failedBands} />
  </div>
}
