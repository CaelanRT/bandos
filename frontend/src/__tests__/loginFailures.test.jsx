// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'

const fetchMock = vi.fn()
const backendUser = {
  user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true,
  created_at: '2026-09-03T10:00:00Z',
}

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

function errorResponse(code, message, status, details, headers) {
  return response(
    { error: { code, message, ...(details ? { details } : {}) } },
    status,
    headers,
  )
}

async function renderReadyLogin(destination = '/account') {
  fetchMock.mockResolvedValueOnce(
    errorResponse('AUTHENTICATION_REQUIRED', 'Authentication required', 401),
  )
  const router = createMemoryRouter(routes, {
    initialEntries: [{ pathname: '/login', state: { destination } }],
  })
  render(
    <QueryClientProvider client={createBandosQueryClient()}>
      <SessionBoundary><RouterProvider router={router} /></SessionBoundary>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Login' })
  await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'alex@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'secret')
  return router
}

async function submit() {
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

beforeAll(() => vi.stubGlobal('fetch', fetchMock))
beforeEach(() => fetchMock.mockReset())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Login failures', () => {
  it('shows privacy-safe invalid-credential feedback, focuses it, and preserves values', async () => {
    await renderReadyLogin()
    fetchMock.mockResolvedValueOnce(
      errorResponse('INVALID_CREDENTIALS', 'Unknown email address', 401),
    )

    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid email or password')
    expect(alert).not.toHaveTextContent('Unknown email address')
    expect(alert).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('alex@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('secret')
  })

  it('maps recognized backend details to their fields', async () => {
    await renderReadyLogin()
    fetchMock.mockResolvedValueOnce(
      errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, [
        { field: 'email', message: 'Email is not accepted.' },
      ]),
    )

    await submit()

    expect(await screen.findByText('Email is not accepted.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus()
  })

  it('uses neutral rate-limit guidance without timing metadata', async () => {
    await renderReadyLogin()
    fetchMock.mockResolvedValueOnce(
      errorResponse('TOO_MANY_ATTEMPTS', 'Too many login attempts', 429),
    )

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many login attempts')
    expect(screen.getByRole('alert')).toHaveTextContent('Please wait before trying again.')
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeEnabled()
  })

  it('prevents another attempt before a server-provided retry deadline', async () => {
    await renderReadyLogin()
    fetchMock.mockResolvedValueOnce(
      errorResponse('TOO_MANY_ATTEMPTS', 'Too many login attempts', 429, undefined, {
        'Retry-After': '120',
      }),
    )

    await submit()
    await screen.findByRole('alert')
    await submit()

    expect(screen.getByRole('alert')).toHaveTextContent('Try again after')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeEnabled()
  })

  it('retries only identity retrieval after a transient post-Login failure', async () => {
    const router = await renderReadyLogin('/bands/8?view=calendar#today')
    const visited = []
    router.subscribe((state) => {
      visited.push({ ...state.location, historyAction: state.historyAction })
    })
    fetchMock
      .mockResolvedValueOnce(response({ message: 'logged in' }))
      .mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 'Unavailable', 503))
      .mockResolvedValueOnce(response({ data: { user: backendUser } }))

    await submit()
    expect(await screen.findByRole('heading', { name: 'We couldn’t connect to Bandos' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(visited.some((location) => (
      location.pathname === '/bands/8' && location.search === '?view=calendar' &&
      location.hash === '#today' && location.historyAction === 'REPLACE'
    ))).toBe(true))
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/v1/users/me', '/api/v1/auth/login', '/api/v1/users/me', '/api/v1/users/me',
    ])
  })

  it('shows contextual completion feedback when identity is still unauthenticated', async () => {
    await renderReadyLogin()
    fetchMock
      .mockResolvedValueOnce(response({ message: 'logged in' }))
      .mockResolvedValueOnce(
        errorResponse('AUTHENTICATION_REQUIRED', 'Authentication required', 401),
      )

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t complete sign-in. Please try again.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
