import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const MESSAGES = {
  expired: 'Your session expired. Log in to continue.',
  idle_expired: 'Your session expired after inactivity. Log in to continue.',
  absolute_expired: 'Your session reached its time limit. Log in again.',
  revoked: 'Your session ended. Log in again.',
  loggedOut: 'You’ve been logged out.',
  deactivated: 'Your account has been deactivated.',
}

export function LoginNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState(() => MESSAGES[location.state?.expiryReason] || MESSAGES[location.state?.notice])

  useEffect(() => {
    if (!location.state?.notice) return
    const { notice: _consumed, expiryReason: _expiryReason, ...state } = location.state
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
  }, [location, navigate])

  return notice ? <p className="auth-notice" role="status">{notice}</p> : null
}
