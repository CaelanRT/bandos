import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { LogoutButton } from '../auth/LogoutButton.jsx'
import { useSession } from '../../app/sessionContext.js'
import { memberFullName, parseBandId, sortBands, sortMembers } from './api.js'
import { useCreationIntent } from './useCreationIntent.js'
import { destinationFromLocation } from '../../app/destination.js'
import { useBand, useBands } from './queries.js'

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
    <h1>Bandos</h1>
    <h2>Your bands</h2>
    <CreateBandLink />
    {bands.isPending && <p role="status">Loading bands…</p>}
    <ReadFailure query={bands} subject="your bands" />
    {bands.data?.length > 0 && <BandLinks bands={bands.data} />}
    {bands.data?.length === 0 && <p>You don’t belong to any bands yet.</p>}
    {bands.data && <p>Already playing with a band? Share your username, @{user.username}, with its leader so they can add you.</p>}
  </BandShell>
}

function BandMembers({ members }) {
  // Ticket 04 can use this initial intent to open its add-member form once.
  useCreationIntent()
  return <section aria-labelledby="members-heading">
    <h2 id="members-heading">Members</h2>
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
  const bands = useBands()
  const detail = useBand(bandId)
  const band = detail.data
  return <BandShell bands={bands} context={band ? `${band.name} · ${section}` : 'Band workspace'}>
    {bandId === null ? <><h1>Invalid band address</h1><Link to="/">Go home</Link></> :
      band === null ? <><h1>This band is no longer available</h1><Link to="/">Go home</Link></> : <>
        {detail.isPending && <p role="status">Loading band…</p>}
        <ReadFailure query={detail} subject="this band" />
        {band && <>
          <h1>{band.name}</h1>
          <p>{band.currentUserRole === 'leader' ? 'Leader' : 'Member'}</p>
          <nav aria-label="Band workspace">
            <NavLink to={`/bands/${band.bandId}`} end>Schedule</NavLink>
            <NavLink to={`/bands/${band.bandId}/members`}>Members</NavLink>
          </nav>
          {section === 'Members' ? <BandMembers members={band.members} /> : <>
            <h2>Schedule</h2>
            <p>Schedules are not available yet.</p>
          </>}
        </>}
      </>}
  </BandShell>
}

function CreateBandLink() {
  const location = useLocation()
  return <Link to="/bands/new" state={{ creationOrigin: destinationFromLocation(location) }}>Create a band</Link>
}
