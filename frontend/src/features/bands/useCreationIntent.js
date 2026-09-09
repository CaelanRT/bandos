import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Read once per Members mount, then remove the history marker. The add form
// initializes from this value; refresh/later visits return false.
export function useCreationIntent() {
  const location = useLocation()
  const navigate = useNavigate()
  const [openAddMember] = useState(() => location.state?.openAddMember === true)
  useEffect(() => {
    if (location.state?.openAddMember !== true) return
    const { openAddMember: _intent, ...state } = location.state
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state })
  }, [location, navigate])
  return openAddMember
}
