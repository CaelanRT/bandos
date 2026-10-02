import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AccountMenu } from '../../app/AccountMenu.jsx'
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
    <li key={band.bandId}><NavLink to={`/bands/${band.bandId}`}>{band.name}</NavLink></li>
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
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 47.999rem)').matches ?? false)
  const [openAt, setOpenAt] = useState(null)
  if (openAt !== null && openAt !== location.key) setOpenAt(null)
  const open = narrow && openAt === location.key
  const dismissDrawer = useCallback(() => setOpenAt(null), [])
  const menu = useRef(null)
  const drawer = useRef(null)
  const returnFocusAt = useRef(null)
  const index = useRef(null)
  const main = useRef(null)
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 48rem)')
    if (!media) return
    function resize() {
      setNarrow(!media.matches)
      if (media.matches) setOpenAt(null)
    }
    resize()
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])
  useLayoutEffect(() => {
    main.current?.focus({ preventScroll: true })
  }, [location.key])
  useLayoutEffect(() => {
    if (!open) {
      if (returnFocusAt.current === location.key) menu.current?.focus()
      returnFocusAt.current = null
      return
    }
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    index.current?.querySelector('a')?.focus()
    return () => { document.documentElement.style.overflow = previousOverflow }
  }, [open, location.key])
  function closeMenu() {
    returnFocusAt.current = location.key
    setOpenAt(null)
  }
  function containFocus(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu() }
    if (event.key !== 'Tab') return
    const controls = [...drawer.current.querySelectorAll('a[href], button')].filter((control) => !control.disabled)
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus()
    }
  }
  const navigation = <nav ref={index} id="band-index" className="band-index" aria-label="Primary"
    onClick={(event) => {
      if (open && event.target.closest('a[href]') && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) closeMenu()
    }}>
    <NavLink to="/" end>Datebook</NavLink>
    <h2>Your bands</h2>
    {bands.isPending && <p role="status">Loading bands…</p>}
    <ReadFailure query={bands} subject="your bands" />
    {bands.data && <BandLinks bands={bands.data} />}
    <CreateBandLink compact />
  </nav>
  return <div className="band-shell">
    <a className="skip-link" href="#main-content" inert={open}>Skip to main content</a>
    <header className="workspace-header" inert={open}>
      <button ref={menu} className="menu-toggle" type="button" aria-label="Open navigation"
        aria-expanded={open} aria-controls="navigation-drawer" onClick={() => setOpenAt(location.key)}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <Link className="workspace-wordmark" to="/">Bandos</Link>
      <p>{context}</p>
      <AccountMenu drawerOpen={open} onOpen={dismissDrawer} />
    </header>
    {narrow ? <div className="navigation-overlay" hidden={!open} onClick={(event) => {
      if (event.target === event.currentTarget) closeMenu()
    }}>
      <div ref={drawer} id="navigation-drawer" className="navigation-drawer" role="dialog"
        aria-modal="true" aria-label="Navigation" onKeyDown={containFocus}>
        <div className="drawer-header">
          <span className="drawer-wordmark">BandOS</span>
          <button type="button" aria-label="Close navigation" onClick={closeMenu}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {navigation}
      </div>
    </div> : navigation}
    <main ref={main} id="main-content" tabIndex="-1" inert={open}>{children}</main>
  </div>
}

export function BandsHome() {
  const bands = useBands()
  const { user } = useSession()
  return <BandShell bands={bands} context="Datebook">
    <div className="datebook-home">
      <DeletionNotice />
      <h1>Personal datebook</h1>
      <Datebook />
      {bands.data?.length === 0 && <div className="datebook-empty">
        <p>You don’t belong to any bands yet.</p>
        <CreateBandLink />
        <p>Already playing with a band? Share your username, @{user.username}, with its leader so they can add you.</p>
      </div>}
    </div>
  </BandShell>
}

function BandMembers({ band }) {
  const { members } = band
  return <section className="band-people" aria-labelledby="members-heading">
    <h2 id="members-heading">Members</h2>
    <AddBandMember band={band} />
    {members.length === 0 ? <p>No active members to display.</p> :
      <ul aria-label="Band members" className="member-list">
        {sortMembers(members).map((member) => <li key={member.userId}>
          <p className="member-name"><strong>{memberFullName(member)}</strong></p>
          <p className="member-username">@{member.username}</p>
          <p className="member-role">{member.role === 'leader' ? 'Leader' : 'Member'}</p>
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
    {bandId === null ? <div className="workspace-message"><h1>Invalid band address</h1><Link to="/">Go home</Link></div> :
      band === null ? <div className="workspace-message"><h1>This band is no longer available</h1><Link to="/">Go home</Link></div> : <>
        {detail.isPending && <p className="workspace-message" role="status">Loading band…</p>}
        <div className="workspace-notice"><ReadFailure query={detail} subject="this band" /></div>
        {band && <>
          {section === 'Settings' && band.currentUserRole === 'member' &&
            <Navigate to={`/bands/${band.bandId}`} replace state={{ bandPermissionNotice: true }} />}
          {section === 'Create event' && band.currentUserRole === 'member' &&
            <Navigate to={`/bands/${band.bandId}`} replace state={{ eventPermissionNotice: true }} />}
          {section === 'Edit event' && band.currentUserRole === 'member' && eventId !== null &&
            <Navigate to={`/bands/${band.bandId}/events/${eventId}`} replace state={{ eventPermissionNotice: true }} />}
          <div className="workspace-notice">
            {section === 'Schedule' && location.state?.bandPermissionNotice &&
              <p role="status">Only band leaders can access Settings.</p>}
            {section === 'Schedule' && location.state?.eventPermissionNotice &&
              <p role="status">Only band leaders can create events.</p>}
            {section === 'Schedule' && location.state?.eventManagementPermissionNotice &&
              <p role="status">Only band leaders can manage events.</p>}
          </div>
          {section !== 'Event' && <div className="workspace-identity"><h1>{band.name}</h1>
            <p>{band.currentUserRole === 'leader' ? 'Leader' : 'Member'}</p></div>}
          <nav className="workspace-navigation" aria-label="Band workspace">
            <NavLink to={`/bands/${band.bandId}`} end>Schedule</NavLink>
            <NavLink to={`/bands/${band.bandId}/members`}
              onClick={(event) => { if (section === 'Members') event.preventDefault() }}>Members</NavLink>
            {band.currentUserRole === 'leader' && !band.managementDenied &&
              <NavLink to={`/bands/${band.bandId}/settings`}
                onClick={(event) => { if (section === 'Settings') event.preventDefault() }}>Settings</NavLink>}
          </nav>
          {section === 'Event' ? eventId === null ? <div className="event-recovery">
            <h1>This event is no longer available.</h1><Link to={'/bands/' + band.bandId}>Back to Schedule</Link>
          </div> : <EventDetail bandId={band.bandId} eventId={eventId} canEdit={band.currentUserRole === 'leader' && !band.managementDenied} /> :
            section === 'Settings' ? band.currentUserRole === 'leader' && <BandSettings key={band.bandId} band={band} /> :
            section === 'Members' ? <BandMembers key={band.bandId} band={band} /> :
            section === 'Create event' ? band.currentUserRole === 'leader' && <CreateEvent key={band.bandId} band={band} /> :
            section === 'Edit event' ? eventId === null ? <div className="event-recovery"><h1>This event is no longer available.</h1><Link to={'/bands/' + band.bandId}>Back to Schedule</Link></div> :
              band.currentUserRole === 'leader' && <EditEvent key={`${band.bandId}-${eventId}`} band={band} eventId={eventId} /> :
              <BandSchedule key={band.bandId} bandId={band.bandId} canCreate={band.currentUserRole === 'leader' && !band.managementDenied} />}
        </>}
      </>}
  </BandShell>
}

function CreateBandLink({ compact = false }) {
  const location = useLocation()
  const current = /^\/bands\/new\/?$/.test(location.pathname)
  return <Link to="/bands/new"
    className={compact ? 'create-band-action' : undefined}
    aria-label={compact ? 'Create a band' : undefined}
    aria-current={current ? 'page' : undefined}
    state={current ? location.state : { creationOrigin: destinationFromLocation(location) }}
    onClick={(event) => { if (current) event.preventDefault() }}>
    {compact ? <>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="create-band-label">Create a band</span>
    </> : 'Create a band'}
  </Link>
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
