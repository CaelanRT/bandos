// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function apiError(code, message, status, details, headers) {
  return jsonResponse(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    status,
    headers,
  )
}

function signedOutResponse() {
  return apiError('AUTHENTICATION_REQUIRED', 'Authentication required', 401)
}

function renderLogin(destination) {
  const router = createMemoryRouter(routes, {
    initialEntries: [
      { pathname: '/login', state: destination ? { destination } : null },
    ],
  })
  render(
    <QueryClientProvider client={createBandosQueryClient()}>
      <SessionBoundary>
        <RouterProvider router={router} />
      </SessionBoundary>
    </QueryClientProvider>,
  )
  return router
}

async function openLogin(destination) {
  fetchMock.mockResolvedValueOnce(signedOutResponse())
  const router = renderLogin(destination)
  await screen.findByRole('heading', { name: 'Login' })
  return router
}

beforeAll(() => vi.stubGlobal('fetch', fetchMock))
beforeEach(() => fetchMock.mockReset())
afterEach(() => cleanup())

describe('Login form', () => {
  it('is labeled, validates after blur, and toggles password visibility without losing its value', async () => {
    await openLogin()
    const user = userEvent.setup()
    const email = screen.getByRole('textbox', { name: 'Email' })
    const password = screen.getByLabelText('Password')

    expect(email).toHaveAttribute('autocomplete', 'username')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(email)
    await user.tab()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    await user.type(email, 'alex@example.com')
    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument()

    await user.type(password, ' secret ')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue(' secret ')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('validates all fields on submit and focuses the first invalid field', async () => {
    await openLogin()

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('submits the exact normalized credentials, retrieves identity, and replaces to the destination', async () => {
    const router = await openLogin('/account?tab=profile#email')
    const visited = []
    router.subscribe((state) => {
      visited.push({ ...state.location, historyAction: state.historyAction })
    })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'logged in' }))
      .mockResolvedValueOnce(jsonResponse({ data: { user: backendUser } }))

    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), '  Alex@Example.COM ')
    await userEvent.type(screen.getByLabelText('Password'), ' secret ')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(visited.some((location) => (
      location.pathname === '/account' && location.search === '?tab=profile' &&
      location.hash === '#email' && location.historyAction === 'REPLACE'
    ))).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/login$/)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ email: 'alex@example.com', password: ' secret ' }),
    })
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/users\/me$/)
  })

  it('disables every action and prevents duplicate requests while pending', async () => {
    await openLogin('/account')
    let resolveLogin
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveLogin = resolve }))
    const email = screen.getByRole('textbox', { name: 'Email' })
    const password = screen.getByLabelText('Password')
    await userEvent.type(email, 'alex@example.com')
    await userEvent.type(password, 'secret')

    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))

    expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled()
    expect(email).toBeDisabled()
    expect(password).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.submit(screen.getByRole('button', { name: 'Logging in…' }).closest('form'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    resolveLogin(apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401))
  })

  it('preserves the intended destination on the Registration link', async () => {
    const router = await openLogin('/bands/8/events/21')

    await userEvent.click(screen.getByRole('link', { name: 'Register' }))

    expect(router.state.location.pathname).toBe('/register')
    expect(router.state.location.state).toEqual({ destination: '/bands/8/events/21' })
    expect(router.state.historyAction).toBe('PUSH')
  })
})
