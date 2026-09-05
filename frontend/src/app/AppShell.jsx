import { useSession } from './sessionContext.js'
import { LogoutButton } from '../features/auth/LogoutButton.jsx'

export function AppShell({ children }) {
  const session = useSession()
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header>
        <nav aria-label="Primary">
          <a href="/">Bandos</a>
          {session.status === 'authenticated' && <LogoutButton />}
        </nav>
      </header>
      <main id="main-content" tabIndex="-1">
        {children}
      </main>
    </>
  )
}
