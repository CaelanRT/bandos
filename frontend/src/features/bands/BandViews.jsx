import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { LogoutButton } from '../auth/LogoutButton.jsx'
import { useSession } from '../../app/sessionContext.js'
import { parseBandId, sortBands } from './api.js'
import { useBand, useBands } from './queries.js'

function BandLinks({ bands }) {
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

function BandShell({ children, bands, context }) {
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
    {bands.isPending && <p role="status">Loading bands…</p>}
    <ReadFailure query={bands} subject="your bands" />
    {bands.data?.length > 0 && <BandLinks bands={bands.data} />}
    {bands.data?.length === 0 && <p>You don’t belong to any bands yet.</p>}
    {bands.data && <p>Already playing with a band? Share your username, @{user.username}, with its leader so they can add you.</p>}
  </BandShell>
}

export function BandWorkspace() {
  const { bandId: parameter } = useParams()
  const bandId = parseBandId(parameter)
  const bands = useBands()
  const detail = useBand(bandId)
  const band = detail.data
  return <BandShell bands={bands} context={band ? `${band.name} · Schedule` : 'Band workspace'}>
    {bandId === null ? <><h1>Invalid band address</h1><Link to="/">Go home</Link></> :
      band === null ? <><h1>This band is no longer available</h1><Link to="/">Go home</Link></> : <>
        {detail.isPending && <p role="status">Loading band…</p>}
        <ReadFailure query={detail} subject="this band" />
        {band && <>
          <h1>{band.name}</h1>
          <p>{band.currentUserRole === 'leader' ? 'Leader' : 'Member'}</p>
          <h2>Schedule</h2>
          <p>Schedules are not available yet.</p>
        </>}
      </>}
  </BandShell>
}
