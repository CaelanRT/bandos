import { createContext, useContext } from 'react'

export const SessionContext = createContext(null)

export function useSession() {
  const session = useContext(SessionContext)

  if (session === null) {
    throw new Error('useSession must be used within SessionBoundary.')
  }

  return session
}
