import { useCallback, useRef } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { useSession } from './sessionContext.js'

export function useUnsavedNavigation(dirty) {
  const { status } = useSession()
  const bypass = useRef(false)
  const blocker = useBlocker(() => dirty && status === 'authenticated' && !bypass.current)
  useBeforeUnload(useCallback((event) => {
    if (dirty && status === 'authenticated' && !bypass.current) {
      event.preventDefault()
      event.returnValue = ''
    }
  }, [dirty, status]))
  return { blocker, allowNavigation: () => { bypass.current = true } }
}

