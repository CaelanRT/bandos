import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { destinationFromLocation } from './destination.js'
import { useSession } from './sessionContext.js'

export function SessionRoutes() {
  const { endReason, acknowledgeEnd } = useSession()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/login' && endReason) acknowledgeEnd()
  }, [location.pathname, endReason, acknowledgeEnd])

  if (endReason && location.pathname !== '/login') {
    const state = { notice: endReason }
    if (endReason === 'expired') state.destination = destinationFromLocation(location)
    return <Navigate to="/login" replace state={state} />
  }

  return <Outlet />
}
