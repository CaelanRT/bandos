import { useSession } from './sessionContext.js'
import { BandShell } from '../features/bands/BandViews.jsx'
import { useBands } from '../features/bands/queries.js'

export function AppShell({ children }) {
  const session = useSession()
  if (session.status === 'authenticated') return <AuthenticatedShell>{children}</AuthenticatedShell>
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="entry-header">
        <nav aria-label="Primary">
          <a href="/">Bandos</a>
        </nav>
      </header>
      <main className="entry-main" id="main-content" tabIndex="-1">
        {children}
      </main>
    </>
  )
}

function AuthenticatedShell({ children }) {
  const bands = useBands()
  return <BandShell bands={bands}>{children}</BandShell>
}
