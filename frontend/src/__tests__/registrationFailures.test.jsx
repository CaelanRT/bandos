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

async function renderReadyRegistration(destination = '/account') {
  fetchMock.mockResolvedValueOnce(
    errorResponse('AUTHENTICATION_REQUIRED', 'Authentication required', 401),
  )
  const router = createMemoryRouter(routes, {
    initialEntries: [{ pathname: '/register', state: { destination } }],
  })
  render(
    <QueryClientProvider client={createBandosQueryClient()}>
      <SessionBoundary><RouterProvider router={router} /></SessionBoundary>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Register' })
  await userEvent.type(screen.getByLabelText('First name'), 'Alex')
  await userEvent.type(screen.getByLabelText('Last name'), 'Rivera')
  await userEvent.type(screen.getByLabelText('Username'), 'alex')
  await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'alex@example.com')
  await userEvent.type(screen.getByLabelText('Password'), ' secret ')
  return router
}

async function submit() {
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

beforeAll(() => vi.stubGlobal('fetch', fetchMock))
beforeEach(() => fetchMock.mockReset())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Registration failures', () => {
  it('shows privacy-safe account-conflict feedback, focuses it, and preserves values', async () => {
    await renderReadyRegistration()
    fetchMock.mockResolvedValueOnce(
      errorResponse('ACCOUNT_CONFLICT', 'Unknown email address', 409),
    )

    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That username or email is already in use.')
    expect(alert).not.toHaveTextContent('Unknown email address')
    expect(alert).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('alex@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue(' secret ')
  })

  it('maps recognized backend details to their fields', async () => {
    await renderReadyRegistration()
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
    await renderReadyRegistration()
    fetchMock.mockResolvedValueOnce(
      errorResponse('TOO_MANY_ATTEMPTS', 'Too many registration attempts', 429),
    )

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many registration attempts')
    expect(screen.getByRole('alert')).toHaveTextContent('Please wait before trying again.')
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeEnabled()
  })

  it('prevents another attempt before a server-provided retry deadline', async () => {
    await renderReadyRegistration()
    fetchMock.mockResolvedValueOnce(
      errorResponse('TOO_MANY_ATTEMPTS', 'Too many registration attempts', 429, undefined, {
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

  it('retries only identity retrieval after a transient post-Registration failure', async () => {
    const router = await renderReadyRegistration('/bands/8?view=calendar#today')
    const visited = []
    router.subscribe((state) => {
      visited.push({ ...state.location, historyAction: state.historyAction })
    })
    fetchMock
      .mockResolvedValueOnce(response({ message: 'created' }, 201))
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
      '/api/v1/users/me', '/api/v1/auth/register', '/api/v1/users/me', '/api/v1/users/me',
    ])
  })

  it('shows contextual completion feedback when identity is still unauthenticated', async () => {
    await renderReadyRegistration()
    fetchMock
      .mockResolvedValueOnce(response({ message: 'created' }, 201))
      .mockResolvedValueOnce(
        errorResponse('AUTHENTICATION_REQUIRED', 'Authentication required', 401),
      )

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t complete sign-in after registration. Please log in.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})


it.each(['INTERNAL_ERROR', 'network', 'malformed', 'empty details'])('handles %s failures without retrying or losing values', async (kind) => {
  await renderReadyRegistration()
  if (kind === 'network') fetchMock.mockRejectedValueOnce(new TypeError('offline'))
  else if (kind === 'malformed') fetchMock.mockResolvedValueOnce(response({ unexpected: true }, 201))
  else if (kind === 'empty details') fetchMock.mockResolvedValueOnce(errorResponse('VALIDATION_ERROR', 'Invalid', 400, []))
  else fetchMock.mockResolvedValueOnce(errorResponse(kind, 'Internal information', 500))
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t create your account.')
  expect(screen.getByRole('alert')).toHaveFocus()
  for (const [label, value] of Object.entries({ 'First name': 'Alex', 'Last name': 'Rivera', Username: 'alex', Email: 'alex@example.com', Password: ' secret ' })) {
    expect(screen.getByLabelText(label)).toHaveValue(value)
    expect(screen.getByLabelText(label)).toBeEnabled()
  }
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('maps all recognized field details and focuses the first field in display order', async () => {
  await renderReadyRegistration()
  fetchMock.mockResolvedValueOnce(errorResponse('VALIDATION_ERROR', 'Invalid', 400, [
    { field: 'password', message: 'Password rejected.' },
    { field: 'username', message: 'Username rejected.' },
    { field: 'lastName', message: 'Last name rejected.' },
    { field: 'email', message: 'Email rejected.' },
    { field: 'firstName', message: 'First name rejected.' },
  ]))
  await submit()
  expect(await screen.findByText('First name rejected.')).toBeInTheDocument()
  expect(screen.getByLabelText('First name')).toHaveFocus()
  expect(screen.getByLabelText('Username')).toHaveAccessibleDescription('3–50 characters Username rejected.')
  expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('8–72 characters Password rejected.')
})

it('keeps unknown backend details in a focused form alert', async () => {
  await renderReadyRegistration()
  fetchMock.mockResolvedValueOnce(errorResponse('VALIDATION_ERROR', 'Invalid', 400, [
    { field: 'body', message: 'Check your account details.' },
  ]))
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your account details.')
  expect(screen.getByRole('alert')).toHaveFocus()
})

it.each(['invalid', '-1'])('does not invent timing for Retry-After %s', async (header) => {
  await renderReadyRegistration()
  fetchMock.mockResolvedValueOnce(errorResponse('TOO_MANY_ATTEMPTS', 'Too many attempts', 429, undefined, { 'Retry-After': header }))
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('Please wait before trying again.')
  expect(screen.getByRole('alert')).not.toHaveTextContent('Try again after')
})

it.each([false, true])('permits a new attempt after the deadline (visibility refresh: %s)', async (refresh) => {
  await renderReadyRegistration()
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  fetchMock.mockResolvedValueOnce(errorResponse('TOO_MANY_ATTEMPTS', 'Too many attempts', 429, undefined, { 'Retry-After': new Date(now + 120000).toUTCString() }))
  await submit()
  await submit()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  clock.mockReturnValue(now + 121000)
  if (refresh) fireEvent(document, new Event('visibilitychange'))
  fetchMock.mockResolvedValueOnce(errorResponse('ACCOUNT_CONFLICT', 'Conflict', 409))
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('That username or email is already in use.')
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('returns to Registration when Retry finds no session without repeating creation', async () => {
  await renderReadyRegistration()
  fetchMock.mockResolvedValueOnce(response({ message: 'created' }, 201))
    .mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 'Unavailable', 503))
    .mockResolvedValueOnce(errorResponse('AUTHENTICATION_REQUIRED', 'Required', 401))
  await submit()
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t complete sign-in')
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/register'))).toHaveLength(1)
})
