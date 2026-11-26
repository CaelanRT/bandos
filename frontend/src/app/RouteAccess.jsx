import { Navigate, useLocation } from 'react-router-dom'
import { destinationFromLocation, resolveDestination } from './destination.js'
import { useSession } from './sessionContext.js'

export function ProtectedRoute({ children }) {
  const session = useSession()
  const location = useLocation()

  if (session.status === 'verification_required') {
    return <Navigate to="/verify-email" replace state={{ destination: destinationFromLocation(location) }} />
  }

  if (session.status === 'signedOut') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ destination: destinationFromLocation(location) }}
      />
    )
  }

  return children
}

export function SignedOutOnlyRoute({ children }) {
  const session = useSession()
  const location = useLocation()

  // A completed token flow can require an explicit fresh login, even with another account open.
  if (location.pathname === '/login' && location.state?.requireLogin === true) return children

  if (session.status === 'verification_required') {
    return <Navigate to="/verify-email" replace state={{ destination: resolveDestination(session.destination || location.state?.destination) }} />
  }

  if (session.status === 'authenticated') {
    return <Navigate to={session.destination || '/'} replace />
  }

  return children
}
