// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'

const fetchMock = vi.fn()

const backendUser = {
  user_id: 17,
  username: 'alex',
  first_name: 'Alex',
  last_name: 'Rivera',
  email: 'alex@example.com',
  plan: 'free',
  is_active: true,
  created_at: '2026-09-03T10:00:00Z',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authenticatedResponse() {
  return jsonResponse({ data: { user: backendUser } })
}

function authenticationRequiredResponse() {
  return jsonResponse(
    {
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      },
    },
    401,
  )
}

function renderApplication(initialEntry = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] })
  const client = createBandosQueryClient()

  render(
    <QueryClientProvider client={client}>
      <SessionBoundary>
        <RouterProvider router={router} />
      </SessionBoundary>
    </QueryClientProvider>,
  )

  return router
}

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
})

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('session restoration', () => {
  it('shows only the neutral status until the initial session check resolves', async () => {
    let resolveRequest
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )

    renderApplication('/login')

    expect(screen.getByRole('status')).toHaveTextContent('Loading Bandos…')
    expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument()

    resolveRequest(authenticationRequiredResponse())

    expect(
      await screen.findByRole('heading', { name: 'Login' }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('restores a valid session and exposes protected content', async () => {
    fetchMock.mockResolvedValueOnce(authenticatedResponse())

    renderApplication('/')

    expect(
      await screen.findByRole('heading', { name: 'Bandos' }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/users\/me$/),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('keeps a transient failure distinct from signed-out state and can retry', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'INTERNAL_ERROR', message: 'Unavailable' } },
          503,
        ),
      )
      .mockResolvedValueOnce(authenticationRequiredResponse())

    renderApplication('/login')

    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t connect to Bandos',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { name: 'Login' }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('route access', () => {
  it.each([
    '/',
    '/account?tab=profile#email',
    '/bands/12',
    '/bands/12/members',
    '/bands/12/events/new',
    '/bands/12/events/34',
    '/bands/12/events/34/edit',
  ])('sends signed-out protected entry %s to Login with its destination', async (entry) => {
    fetchMock.mockResolvedValueOnce(authenticationRequiredResponse())

    const router = renderApplication(entry)

    expect(
      await screen.findByRole('heading', { name: 'Login' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ destination: entry })
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it.each(['/login', '/register'])('redirects authenticated entry to %s to root', async (entry) => {
    fetchMock.mockResolvedValueOnce(authenticatedResponse())

    const router = renderApplication(entry)

    expect(
      await screen.findByRole('heading', { name: 'Bandos' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('keeps the catch-all publicly reachable', async () => {
    fetchMock.mockResolvedValueOnce(authenticationRequiredResponse())

    renderApplication('/not-a-real-page')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
