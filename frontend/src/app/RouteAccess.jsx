import { Navigate, useLocation } from 'react-router-dom'
import { destinationFromLocation } from './destination.js'
import { useSession } from './sessionContext.js'

export function ProtectedRoute({ children }) {
  const session = useSession()
  const location = useLocation()

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

  if (session.status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  return children
}
