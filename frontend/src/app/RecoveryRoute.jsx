import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from './sessionContext.js'
import { resolveDestination } from './destination.js'
import { LogoutButton } from '../features/auth/LogoutButton.jsx'

const TITLES = {
  '/verify-email': 'Verify your email',
  '/verify-email-change': 'Confirm your email change',
  '/forgot-password': 'Recover your account',
  '/reset-password': 'Reset your password',
}

// Access scaffolding; the verification and security tickets supply these forms.
export function RecoveryRoute() {
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = resolveDestination(location.state?.destination || session.destination)
  useEffect(() => {
    // These routes must never carry credentials into navigation history/state.
    if (location.search || location.hash) navigate(location.pathname, { replace: true, state: { destination } })
  }, [location, destination, navigate])

  return <main className="entry-main">
    <meta name="referrer" content="no-referrer" />
    <h1>{TITLES[location.pathname]}</h1>
    {location.pathname === '/verify-email' && session.status === 'verification_required' &&
      <p>Check the verification email sent to {session.user.email}.</p>}
    <Link to="/forgot-password" state={{ destination }}>Account recovery</Link>
    {session.user ? <LogoutButton /> : <Link to="/login" state={{ destination }}>Go to Login</Link>}
  </main>
}
