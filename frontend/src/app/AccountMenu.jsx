import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LogoutButton } from '../features/auth/LogoutButton.jsx'

export function AccountMenu({ onOpen }) {
  const location = useLocation()
  const [openAt, setOpenAt] = useState(null)
  const open = openAt === location.key
  const id = useId()
  const container = useRef(null)
  const trigger = useRef(null)
  const account = useRef(null)
  if (openAt !== null && openAt !== location.key) setOpenAt(null)

  const showFailure = useCallback(() => setOpenAt(location.key), [location.key])
  useLayoutEffect(() => {
    if (open) (container.current?.querySelector('[role="alert"]') ?? account.current)?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    function dismiss(event) {
      if (!container.current?.contains(event.target)) {
        setOpenAt(null)
        // Pointer activation will then focus the outside control, if it has one.
        trigger.current?.focus()
      }
    }
    function escape(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpenAt(null)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function show() {
    onOpen?.()
    setOpenAt(location.key)
  }

  return <div ref={container} className="account-menu" onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpenAt(null)
  }}>
    <button ref={trigger} className="account-menu-trigger" type="button" aria-label="Account menu"
      aria-expanded={open} aria-controls={id}
      onClick={() => { if (open) setOpenAt(null); else show() }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          if (open) account.current?.focus()
          else show()
        }
      }}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </svg>
    </button>
    <div id={id} className="account-menu-panel" hidden={!open}>
      <NavLink ref={account} to="/account">Account</NavLink>
      <LogoutButton onFailure={showFailure} />
    </div>
  </div>
}
