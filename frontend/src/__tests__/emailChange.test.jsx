// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { sessionFixture } from './fixtures/session.js'

const fetchMock = vi.fn()
const baseUser = {
  user_id: 17,
  username: 'alex',
  first_name: 'Alex',
  last_name: 'Rivera',
  email: 'alex@example.com',
  plan: 'free',
  is_active: true,
  version: 1,
  email_verified_at: '2026-09-03T10:00:00Z',
  pending_email: null,
  created_at: '2026-09-03T10:00:00Z',
}
const json = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers })
const meResponse = (user = baseUser) => json({ data: { user, session: sessionFixture } })
const bandsResponse = () => json({ data: { bands: [] } })
const failure = (code, status, headers, details) => json({ error: { code, message: code, details } }, status, headers)

function mount(entry) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  const client = createBandosQueryClient()
  render(
    <QueryClientProvider client={client}>
      <SessionBoundary>
        <RouterProvider router={router} />
      </SessionBoundary>
    </QueryClientProvider>,
  )
  return { router, client }
}

const callsFor = (suffix, method = 'POST') =>
  fetchMock.mock.calls.filter(([url, options]) => url.endsWith(suffix) && options?.method === method)

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(cleanup)

it('stages an initial email change, replaces it with the returned version, and syncs profile version', async () => {
  fetchMock.mockImplementation((url) =>
    Promise.resolve(url.endsWith('/bands') ? bandsResponse() : meResponse()))
  mount('/account')
  await screen.findByRole('heading', { name: 'Account' })

  expect(screen.getByText('alex@example.com')).toBeInTheDocument()
  expect(screen.getByText(/stays active until you verify/i)).toBeInTheDocument()
  expect(screen.getByText(/security notice is sent to your current address/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Resend verification email' })).not.toBeInTheDocument()

  const staged = { ...baseUser, pending_email: 'next@example.com', version: 2 }
  fetchMock.mockResolvedValueOnce(json({ data: { user: staged } }, 202))
  fireEvent.change(screen.getByLabelText('New email address'), { target: { value: ' Next@Example.com ' } })
  fireEvent.change(screen.getByLabelText('Current password to confirm email change'), { target: { value: ' secret ' } })
  await userEvent.click(screen.getByRole('button', { name: 'Request email change' }))

  expect(await screen.findByText('next@example.com')).toBeInTheDocument()
  expect(screen.getByText('alex@example.com')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument()
  const firstWrite = callsFor('/users/me/email-change')[0][1]
  expect(JSON.parse(firstWrite.body)).toEqual({
    expectedVersion: 1,
    currentPassword: ' secret ',
    newEmail: 'next@example.com',
  })
  expect(firstWrite.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)

  const replaced = { ...staged, pending_email: 'final@example.com', version: 3 }
  fetchMock.mockResolvedValueOnce(json({ data: { user: replaced } }, 202))
  fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'final@example.com' } })
  fireEvent.change(screen.getByLabelText('Current password to confirm email change'), { target: { value: ' secret ' } })
  await userEvent.click(screen.getByRole('button', { name: 'Replace pending email' }))

  expect(await screen.findByText('final@example.com')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Only the newest verification link works.')
  const secondWrite = callsFor('/users/me/email-change')[1][1]
  expect(JSON.parse(secondWrite.body)).toEqual({
    expectedVersion: 2,
    currentPassword: ' secret ',
    newEmail: 'final@example.com',
  })
  expect(secondWrite.headers.get('Idempotency-Key')).not.toBe(firstWrite.headers.get('Idempotency-Key'))

  const renamed = { ...replaced, username: 'alex2', version: 4 }
  fetchMock.mockImplementation((url, options) => {
    if (options?.method === 'PATCH') return Promise.resolve(json({ data: { user: renamed } }))
    return Promise.resolve(url.endsWith('/bands') ? bandsResponse() : meResponse(renamed))
  })
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), 'alex2')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Profile saved.')
  expect(JSON.parse(callsFor('/users/me', 'PATCH')[0][1].body)).toEqual({ expectedVersion: 3, username: 'alex2' })
})

it('preserves draft on wrong password, conflict, mail unavailable, and stale state, and retries uncertain writes', async () => {
  fetchMock.mockImplementation((url) =>
    Promise.resolve(url.endsWith('/bands') ? bandsResponse() : meResponse()))
  mount('/account')
  await screen.findByRole('heading', { name: 'Account' })

  const emailInput = screen.getByLabelText('New email address')
  const passwordInput = screen.getByLabelText('Current password to confirm email change')
  fireEvent.change(emailInput, { target: { value: 'taken@example.com' } })
  fireEvent.change(passwordInput, { target: { value: 'wrong-pass' } })

  fetchMock.mockResolvedValueOnce(failure('CURRENT_PASSWORD_INCORRECT', 403))
  await userEvent.click(screen.getByRole('button', { name: 'Request email change' }))
  expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
  expect(passwordInput).toHaveAccessibleDescription('Current password is incorrect.')
  expect(emailInput).toHaveValue('taken@example.com')

  fetchMock.mockResolvedValueOnce(failure('ACCOUNT_CONFLICT', 409))
  await userEvent.click(screen.getByRole('button', { name: 'Request email change' }))
  expect(await screen.findByText('That email address is unavailable. Choose another.')).toBeInTheDocument()
  expect(emailInput).toHaveAccessibleDescription('That email address is unavailable. Choose another.')
  expect(emailInput).toHaveValue('taken@example.com')

  fetchMock.mockResolvedValueOnce(failure('MAIL_UNAVAILABLE', 503))
  await userEvent.click(screen.getByRole('button', { name: 'Request email change' }))
  expect(await screen.findByText(/Verification email is unavailable right now/)).toBeInTheDocument()
  expect(emailInput).not.toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Retry same request' })).not.toBeInTheDocument()

  fetchMock.mockRejectedValueOnce(new TypeError('Disconnected'))
  await userEvent.click(screen.getByRole('button', { name: 'Request email change' }))
  await screen.findByRole('button', { name: 'Retry same request' })
  expect(emailInput).toBeDisabled()

  fetchMock.mockResolvedValueOnce(failure('STALE_VERSION', 409))
  await userEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
  await screen.findByRole('button', { name: 'Reload latest' })
  const calls = callsFor('/users/me/email-change')
  expect(calls[calls.length - 1][1].body).toBe(calls[calls.length - 2][1].body)
  expect(calls[calls.length - 1][1].headers.get('Idempotency-Key')).toBe(calls[calls.length - 2][1].headers.get('Idempotency-Key'))

  const refreshed = { ...baseUser, version: 5 }
  fetchMock.mockResolvedValueOnce(meResponse(refreshed))
  await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes and reload' }))
  await waitFor(() => expect(emailInput).toHaveValue(''))
})

it('resends pending email with exact empty body and key, handling cooldown, mail unavailable, and success copy', async () => {
  const pendingUser = { ...baseUser, pending_email: 'pending@example.com', version: 2 }
  fetchMock.mockImplementation((url) =>
    Promise.resolve(url.endsWith('/bands') ? bandsResponse() : meResponse(pendingUser)))
  mount('/account')
  await screen.findByRole('heading', { name: 'Account' })

  const resendButton = screen.getByRole('button', { name: 'Resend verification email' })
  fetchMock.mockResolvedValueOnce(failure('MAIL_UNAVAILABLE', 503))
  await userEvent.click(resendButton)
  expect(await screen.findByText(/Earlier links have not been replaced/)).toBeInTheDocument()
  expect(screen.queryByText(/Only the newest verification link works/)).not.toBeInTheDocument()

  fetchMock.mockResolvedValueOnce(json({ data: { message: 'A verification email has been queued for your pending address' } }, 202))
  await userEvent.click(resendButton)
  expect(await screen.findByText(/Only the newest verification link works/)).toBeInTheDocument()

  const resends = callsFor('/users/me/email-change/resend')
  expect(resends).toHaveLength(2)
  expect(resends[0][1].body).toBe('{}')
  expect(resends[1][1].body).toBe('{}')
  expect(resends[0][1].headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
  expect(resends[1][1].headers.get('Idempotency-Key')).not.toBe(resends[0][1].headers.get('Idempotency-Key'))

  fetchMock.mockResolvedValueOnce(failure('TOO_MANY_ATTEMPTS', 429, { 'Retry-After': '60' }))
  await userEvent.click(resendButton)
  expect(await screen.findByText(/Try again after/)).toBeInTheDocument()
  expect(resendButton).toBeDisabled()
})

it('captures and strips the confirmation token, posts explicitly without a key, and signs out the affected account', async () => {
  fetchMock.mockResolvedValueOnce(meResponse())
  const { router, client } = mount('/verify-email-change?token=change-secret')
  await screen.findByRole('heading', { name: 'Confirm your email change' })
  expect(router.state.location.pathname).toBe('/verify-email-change')
  expect(router.state.location.search).toBe('')
  expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  expect(callsFor('/auth/email-change/confirm')).toHaveLength(0)

  client.setQueryData(['private', 'secret'], 'sensitive')
  fetchMock
    .mockResolvedValueOnce(json({ data: { message: 'Email address updated; please log in again' } }))
    .mockResolvedValueOnce(failure('AUTHENTICATION_REQUIRED', 401))

  await userEvent.click(screen.getByRole('button', { name: 'Confirm email change' }))
  await screen.findByRole('heading', { name: 'Login' })
  expect(screen.getByRole('status')).toHaveTextContent('Email address updated. All devices were signed out. Log in with your new email address.')
  expect(client.getQueryData(['private', 'secret'])).toBeUndefined()

  const confirmCall = callsFor('/auth/email-change/confirm')[0]
  expect(JSON.parse(confirmCall[1].body)).toEqual({ token: 'change-secret' })
  expect(confirmCall[1].headers.get('Idempotency-Key')).toBeNull()

  const meCalls = fetchMock.mock.calls.filter(([url, options]) => url.endsWith('/users/me') && (options?.method ?? 'GET') === 'GET')
  expect(meCalls).toHaveLength(2)
  expect(meCalls[1][1].headers.get('X-bandos-activity')).toBeNull()
})

it('preserves an unrelated signed-in account after confirming another account email change', async () => {
  const otherUser = { ...baseUser, user_id: 22, username: 'pat', email: 'pat@example.com' }
  fetchMock.mockResolvedValueOnce(meResponse(otherUser))
  const { client } = mount('/verify-email-change?token=other-secret')
  await screen.findByRole('heading', { name: 'Confirm your email change' })
  client.setQueryData(['private', 'secret'], 'pat-data')

  fetchMock
    .mockResolvedValueOnce(json({ data: { message: 'Email address updated; please log in again' } }))
    .mockResolvedValueOnce(meResponse(otherUser))

  await userEvent.click(screen.getByRole('button', { name: 'Confirm email change' }))
  expect(await screen.findByRole('status')).toHaveTextContent('All devices for that account were signed out')
  expect(screen.getByRole('status')).toHaveTextContent('You remain signed in as @pat.')
  expect(screen.getByRole('link', { name: 'Continue as @pat' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go to Login' })).toBeInTheDocument()
  expect(client.getQueryData(['private', 'secret'])).toBe('pat-data')
})

it('handles expired, conflicting, and uncertain confirmation outcomes without auto-retry', async () => {
  fetchMock.mockResolvedValueOnce(failure('AUTHENTICATION_REQUIRED', 401))
  mount('/verify-email-change?token=expired-tok')
  await screen.findByRole('button', { name: 'Confirm email change' })
  fetchMock.mockResolvedValueOnce(failure('TOKEN_INVALID_OR_EXPIRED', 400))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email change' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your active email address was not changed')
  expect(screen.queryByRole('button', { name: 'Confirm email change' })).not.toBeInTheDocument()
  cleanup()

  fetchMock.mockResolvedValueOnce(failure('AUTHENTICATION_REQUIRED', 401))
  mount('/verify-email-change?token=conflict-tok')
  await screen.findByRole('button', { name: 'Confirm email change' })
  fetchMock.mockResolvedValueOnce(failure('ACCOUNT_CONFLICT', 409))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email change' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('already in use by another account')
  expect(screen.getByRole('alert')).toHaveTextContent('Your active email address was not changed')
  cleanup()

  fetchMock.mockResolvedValueOnce(failure('AUTHENTICATION_REQUIRED', 401))
  mount('/verify-email-change?token=uncertain-tok')
  await screen.findByRole('button', { name: 'Confirm email change' })
  fetchMock.mockRejectedValueOnce(new TypeError('Network lost'))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email change' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('will not be retried automatically')
  expect(screen.getByRole('button', { name: 'Check session' })).toBeInTheDocument()
  expect(callsFor('/auth/email-change/confirm')).toHaveLength(3)
})
