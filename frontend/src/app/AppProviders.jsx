import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './queryClient.js'
import { router } from './routes.jsx'
import { SessionBoundary } from './SessionBoundary.jsx'

export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionBoundary>
        <RouterProvider router={router} />
      </SessionBoundary>
    </QueryClientProvider>
  )
}
