import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../app/sessionContext.js'

export function LogoutButton() {
  const session = useSession()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const submitting = useRef(false)
  const alertRef = useRef(null)

  useEffect(() => {
    if (failed) alertRef.current?.focus()
  }, [failed])

  async function submit() {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setFailed(false)
    try {
      await session.logOut()
    } catch {
      setFailed(true)
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={submit}>
        {pending ? 'Logging out…' : failed ? 'Retry' : 'Log out'}
      </button>
      {pending && <span role="status">Logging out…</span>}
      {failed && <p ref={alertRef} role="alert" tabIndex="-1">We couldn’t log you out. Try again.</p>}
    </div>
  )
}
