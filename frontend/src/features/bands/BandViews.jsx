import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { LogoutButton } from '../auth/LogoutButton.jsx'
import { useSession } from '../../app/sessionContext.js'
import { memberFullName, parseBandId, sortBands, sortMembers } from './api.js'
import { BandSettings } from './BandSettings.jsx'
import { AddBandMember } from './AddBandMember.jsx'
import { destinationFromLocation } from '../../app/destination.js'
import { useBand, useBands } from './queries.js'
import { parseEventId } from '../events/api.js'
import { EventDetail } from '../events/EventDetail.jsx'
import { BandSchedule } from '../events/BandSchedule.jsx'
import { CreateEvent } from '../events/CreateEvent.jsx'
import { EditEvent } from '../events/EditEvent.jsx'
import { Datebook } from '../datebook/Datebook.jsx'

export function BandLinks({ bands }) {
  return <ul>{sortBands(bands).map((band) => (
    <li key={band.bandId}><Link to={`/bands/${band.bandId}`}>{band.name}</Link></li>
  ))}</ul>
}

function ReadFailure({ query, subject }) {
  if (!query.isError) return null
  return <div role="alert">
    <p>We couldn’t {query.data ? 'update' : 'load'} {subject}.</p>
    <button type="button" disabled={query.isFetching} onClick={() => query.refetch()}>
      {query.isFetching ? 'Retrying…' : 'Retry'}
    </button>
  </div>
}

export function BandShell({ children, bands, context }) {
  const location = useLocation()
  const [openAt, setOpenAt] = useState(null)
  if (openAt !== null && openAt !== location.key) setOpenAt(null)
  const open = openAt === location.key
  const menu = useRef(null)
  const index = useRef(null)
  const main = useRef(null)
  useEffect(() => {
    main.current?.focus()
  }, [location.key])
  useEffect(() => {
    if (open) index.current?.querySelector('a')?.focus()
  }, [open])
  function closeMenu() {
    setOpenAt(null)
    menu.current?.focus()
  }
  return <div className="band-shell" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); closeMenu() }
  }}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="workspace-header">
      <Link to="/">Bandos</Link>
      <p>{context}</p>
      <button ref={menu} className="menu-toggle" type="button" aria-expanded={open}
        aria-controls="band-index" onClick={() => {
          if (open) closeMenu()
          else setOpenAt(location.key)
        }}>Menu</button>
      <LogoutButton />
    </header>
    <nav ref={index} id="band-index" className={`band-index${open ? ' is-open' : ''}`} aria-label="Primary">
      <Link to="/">Home</Link>
      <CreateBandLink />
      <NavLink to="/account">Account</NavLink>
      <h2>Your bands</h2>
      {bands.isPending && <p role="status">Loading bands…</p>}
      <ReadFailure query={bands} subject="your bands" />
      {bands.data && <BandLinks bands={bands.data} />}
    </nav>
    <main ref={main} id="main-content" tabIndex="-1">{children}</main>
  </div>
}

export function BandsHome() {
  const bands = useBands()
  const { user } = useSession()
  return <BandShell bands={bands} context="Home">
    <DeletionNotice />
    <h1>Personal datebook</h1>
    <Datebook />
    {bands.data?.length === 0 && <>
      <p>You don’t belong to any bands yet.</p>
      <CreateBandLink />
      <p>Already playing with a band? Share your username, @{user.username}, with its leader so they can add you.</p>
    </>}
  </BandShell>
}

function BandMembers({ band }) {
  const { members } = band
  return <section aria-labelledby="members-heading">
    <h2 id="members-heading">Members</h2>
    <AddBandMember band={band} />
    {members.length === 0 ? <p>No active members to display.</p> :
      <ul aria-label="Band members" className="member-list">
        {sortMembers(members).map((member) => <li key={member.userId}>
          <p><strong>{memberFullName(member)}</strong>{member.role === 'leader' && <> · <span>Leader</span></>}</p>
          <p>@{member.username}</p>
        </li>)}
      </ul>}
  </section>
}

export function BandWorkspace({ section = 'Schedule' }) {
  const { bandId: parameter } = useParams()
  const bandId = parseBandId(parameter)
  const { eventId: eventParameter } = useParams()
  const eventId = parseEventId(eventParameter)
  const bands = useBands()
  const detail = useBand(bandId)
  const band = detail.data
  const location = useLocation()
  return <BandShell bands={bands} context={band ? `${band.name} · ${section}` : 'Band workspace'}>
    {bandId === null ? <><h1>Invalid band address</h1><Link to="/">Go home</Link></> :
      band === null ? <><h1>This band is no longer available</h1><Link to="/">Go home</Link></> : <>
        {detail.isPending && <p role="status">Loading band…</p>}
        <ReadFailure query={detail} subject="this band" />
        {band && <>
          {section === 'Settings' && band.currentUserRole === 'member' &&
            <Navigate to={`/bands/${band.bandId}`} replace state={{ bandPermissionNotice: true }} />}
          {section === 'Create event' && band.currentUserRole === 'member' &&
            <Navigate to={`/bands/${band.bandId}`} replace state={{ eventPermissionNotice: true }} />}
          {section === 'Edit event' && band.currentUserRole === 'member' && eventId !== null &&
            <Navigate to={`/bands/${band.bandId}/events/${eventId}`} replace state={{ eventPermissionNotice: true }} />}
          {section === 'Schedule' && location.state?.bandPermissionNotice &&
            <p role="status">Only band leaders can access Settings.</p>}
          {section === 'Schedule' && location.state?.eventPermissionNotice &&
            <p role="status">Only band leaders can create events.</p>}
          {section === 'Schedule' && location.state?.eventManagementPermissionNotice &&
            <p role="status">Only band leaders can manage events.</p>}
          {section !== 'Event' && <><h1>{band.name}</h1>
            <p>{band.currentUserRole === 'leader' ? 'Leader' : 'Member'}</p></>}
          <nav aria-label="Band workspace">
            <NavLink to={`/bands/${band.bandId}`} end>Schedule</NavLink>
            <NavLink to={`/bands/${band.bandId}/members`}
              onClick={(event) => { if (section === 'Members') event.preventDefault() }}>Members</NavLink>
            {band.currentUserRole === 'leader' && !band.managementDenied &&
              <NavLink to={`/bands/${band.bandId}/settings`}
                onClick={(event) => { if (section === 'Settings') event.preventDefault() }}>Settings</NavLink>}
          </nav>
          {section === 'Event' ? eventId === null ? <>
            <h1>This event is no longer available.</h1><Link to={'/bands/' + band.bandId}>Back to Schedule</Link>
          </> : <EventDetail bandId={band.bandId} eventId={eventId} canEdit={band.currentUserRole === 'leader' && !band.managementDenied} /> :
            section === 'Settings' ? band.currentUserRole === 'leader' && <BandSettings key={band.bandId} band={band} /> :
            section === 'Members' ? <BandMembers key={band.bandId} band={band} /> :
            section === 'Create event' ? band.currentUserRole === 'leader' && <CreateEvent key={band.bandId} band={band} /> :
            section === 'Edit event' ? eventId === null ? <><h1>This event is no longer available.</h1><Link to={'/bands/' + band.bandId}>Back to Schedule</Link></> :
              band.currentUserRole === 'leader' && <EditEvent key={`${band.bandId}-${eventId}`} band={band} eventId={eventId} /> :
              <BandSchedule key={band.bandId} bandId={band.bandId} canCreate={band.currentUserRole === 'leader' && !band.managementDenied} />}
        </>}
      </>}
  </BandShell>
}

function CreateBandLink() {
  const location = useLocation()
  if (/^\/bands\/new\/?$/.test(location.pathname)) return <span aria-current="page">Create a band</span>
  return <Link to="/bands/new" state={{ creationOrigin: destinationFromLocation(location) }}>Create a band</Link>
}

function DeletionNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const [deleted] = useState(() => location.state?.bandDeleted === true)
  useEffect(() => {
    if (!location.state?.bandDeleted) return
    const { bandDeleted: _consumed, ...state } = location.state
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
  }, [location, navigate])
  return deleted ? <p role="status">Band deleted.</p> : null
}
