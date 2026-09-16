import { Link } from 'react-router-dom'
import { formatLocalTime } from './schedule.js'
import { useEvent } from './queries.js'

function EventReadFailure({ query }) {
  if (!query.isError) return null
  return <div role="alert">
    <p>We couldn’t {query.data ? 'update' : 'load'} this event.</p>
    <button type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
      {query.isFetching ? 'Retrying…' : 'Retry'}
    </button>
  </div>
}

export function EventDetail({ bandId, eventId }) {
  const detail = useEvent(bandId, eventId)
  const event = detail.data
  const schedule = `/bands/${bandId}`
  if (event === null) return <><h1>This event is no longer available.</h1><Link to={schedule}>Back to Schedule</Link></>
  return <>
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
      <Link to={schedule}>Back to Schedule</Link>
    </article>}
  </>
}
