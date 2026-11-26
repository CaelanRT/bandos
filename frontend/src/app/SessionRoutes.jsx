import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { destinationFromLocation } from './destination.js'
import { useSession } from './sessionContext.js'

const RECOVERY_PATHS = ['/verify-email', '/verify-email-change', '/forgot-password', '/reset-password']

export function SessionRoutes() {
  const { endReason, expiryReason, acknowledgeEnd } = useSession()
  const location = useLocation()

  useEffect(() => {
    if ((location.pathname === '/login' || RECOVERY_PATHS.includes(location.pathname)) && endReason) acknowledgeEnd()
  }, [location.pathname, endReason, acknowledgeEnd])

  if (endReason && location.pathname !== '/login' && !RECOVERY_PATHS.includes(location.pathname)) {
    const state = { notice: endReason, ...(expiryReason ? { expiryReason } : {}) }
    if (endReason === 'expired') state.destination = destinationFromLocation(location)
    return <Navigate to="/login" replace state={state} />
  }

  return <Outlet />
}
