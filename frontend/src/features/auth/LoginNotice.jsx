import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const MESSAGES = {
  loggedOut: 'You’ve been logged out.',
  expired: 'Your session expired. Log in to continue.',
}

export function LoginNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState(() => MESSAGES[location.state?.notice])

  useEffect(() => {
    if (!location.state?.notice) return
    const { notice: _consumed, ...state } = location.state
    navigate(location.pathname + location.search + location.hash, { replace: true, state })
  }, [location, navigate])

  return notice ? <p role="status">{notice}</p> : null
}
