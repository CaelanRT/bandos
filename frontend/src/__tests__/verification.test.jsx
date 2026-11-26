// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { createBandosQueryClient } from '../app/queryClient.js'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { routes } from '../app/routes.jsx'
import { sessionFixture } from './fixtures/session.js'

const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true, version: 1,
  email_verified_at: null, pending_email: null, created_at: '2026-09-03T10:00:00Z' }
const restricted = { user, session: { ...sessionFixture, access: 'verification_required' } }
const full = { user: { ...user, email_verified_at: '2026-09-03T10:00:00Z' }, session: sessionFixture }
const fetchMock = vi.fn()
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
function failure(code, status = 400, headers) { return json({ error: { code, message: code } }, status, headers) }
const signedOut = () => failure('AUTHENTICATION_REQUIRED', 401)
function open(entry = '/verify-email?token=secret', bootstrap = restricted) {
  fetchMock.mockResolvedValueOnce(bootstrap ? json({ data: bootstrap }) : signedOut())
  const router = createMemoryRouter(routes, { initialEntries: [typeof entry === 'string'
    ? { pathname: entry.split('?')[0], search: entry.includes('?') ? '?' + entry.split('?')[1] : '', state: { destination: '/bands/8?view=list&token=private' } } : entry] })
  const client = createBandosQueryClient()
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return router
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('captures only in memory, replaces history, sets no-referrer and never posts on mount', async () => {
  const router = open()
  await screen.findByRole('button', { name: 'Confirm email' })
  expect(router.state.location.search).toBe('')
  expect(router.state.historyAction).toBe('REPLACE')
  expect(router.state.location.state).toEqual({ destination: '/bands/8?view=list' })
  expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  expect(readFileSync('index.html', 'utf8')).toContain('name="referrer" content="no-referrer"')
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(JSON.stringify(localStorage)).not.toContain('secret')
  expect(JSON.stringify(sessionStorage)).not.toContain('secret')
  cleanup()
  open('/verify-email', null)
  expect(await screen.findByText(/If you reloaded this page/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirm email' })).not.toBeInTheDocument()
})

it('continues with the returned full registration session to the sanitized destination', async () => {
  const router = open()
  await screen.findByRole('button', { name: 'Confirm email' })
  fetchMock.mockResolvedValueOnce(json({ data: { message: 'Email verified', ...full } }))
  fetchMock.mockImplementation(async url => url.endsWith('/bands') ? json({ data: { bands: [] } }) : failure('NOT_FOUND', 404))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/bands/8'))
  expect(router.state.location.search).toBe('?view=list')
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"token":"secret"}' })
  expect(fetchMock.mock.calls[1][1].headers.has('Idempotency-Key')).toBe(false)
})

it.each([null, restricted, full])('requires explicit login after null continuation without switching the current account (%j)', async bootstrap => {
  const router = open(undefined, bootstrap)
  await screen.findByRole('button', { name: 'Confirm email' })
  fetchMock.mockResolvedValueOnce(json({ data: { message: 'Email verified', user: null, session: null } }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Email verified. Log in to continue.')
  expect(router.state.location.pathname).toBe('/verify-email')
  expect(Boolean(screen.queryByRole('button', { name: 'Log out' }))).toBe(Boolean(bootstrap))
  fetchMock.mockResolvedValue(json({ data: { bands: [] } }))
  await userEvent.click(screen.getByRole('link', { name: 'Go to Login' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(router.state.location.state).toEqual({ destination: '/bands/8?view=list', requireLogin: true })
})

it('handles invalid/expired/used tokens with recovery and a generic replacement confirmation', async () => {
  open(undefined, null)
  await screen.findByRole('button', { name: 'Confirm email' })
  fetchMock.mockResolvedValueOnce(failure('TOKEN_INVALID_OR_EXPIRED'))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid, expired or already used')
  expect(screen.getByRole('alert')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' Alex@Example.com ' } })
  fetchMock.mockResolvedValueOnce(json({ data: { message: 'If eligible, a verification email has been queued' } }, 202))
  await userEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))
  expect(await screen.findByRole('status')).toHaveTextContent('only the newest link works')
  expect(fetchMock.mock.calls[2][1].body).toBe('{"email":"alex@example.com"}')
})

it('honors Retry-After, reenables after cooldown, and treats mail failure as failure', async () => {
  open('/verify-email')
  await screen.findByRole('button', { name: 'Resend verification email' })
  vi.useFakeTimers()
  fetchMock.mockResolvedValueOnce(failure('TOO_MANY_ATTEMPTS', 429, { 'Retry-After': '60' }))
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Resend verification email' }).closest('form'))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Too many requests')
  expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeDisabled()
  await act(() => vi.advanceTimersByTimeAsync(60000))
  expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled()
})

it('does not claim revocation or success on mail rejection', async () => {
  open('/verify-email')
  await screen.findByRole('button', { name: 'Resend verification email' })
  fetchMock.mockResolvedValueOnce(failure('MAIL_UNAVAILABLE', 503))
  await userEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Earlier links have not been replaced')
  expect(screen.queryByText(/only the newest link works/)).not.toBeInTheDocument()
})

it.each(['network', 'malformed'])('does not replay uncertain consumption (%s) and offers authoritative session recovery', async kind => {
  const router = open()
  await screen.findByRole('button', { name: 'Confirm email' })
  if (kind === 'network') fetchMock.mockRejectedValueOnce(new TypeError('lost response'))
  else fetchMock.mockResolvedValueOnce(json({ data: {} }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('may already be verified')
  expect(screen.queryByRole('button', { name: 'Confirm email' })).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fetchMock.mockResolvedValueOnce(json({ data: full }))
  fetchMock.mockResolvedValue(json({ data: { bands: [] } }))
  await userEvent.click(screen.getByRole('button', { name: 'Check session' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/bands/8'))
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/verification/confirm'))).toHaveLength(1)
  expect(fetchMock.mock.calls[2][1].headers.get('X-bandos-activity')).toBe('user')
  expect(fetchMock.mock.calls[0][1].headers.has('X-bandos-activity')).toBe(false)
})

it.each(['/register', '/login'])('uses restricted structured responses from %s and retains safe destination', async path => {
  const router = open({ pathname: path, state: { destination: '/bands/8' } }, null)
  await screen.findByLabelText('Password')
  if (path === '/register') for (const [label, value] of [['First name', 'Alex'], ['Last name', 'Rivera'], ['Username', 'alex']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: path === '/register' ? 'password' : 'short' } })
  fetchMock.mockResolvedValueOnce(json({ data: restricted }, path === '/register' ? 201 : 200))
  await userEvent.click(screen.getByRole('button', { name: path === '/register' ? 'Create account' : 'Log in' }))
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  expect(router.state.location.state.destination).toBe('/bands/8')
  expect(screen.getByText(/sent to alex@example.com/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Account recovery' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('finishes a deliberately requested fresh login after null confirmation', async () => {
  const router = open(undefined, restricted)
  await screen.findByRole('button', { name: 'Confirm email' })
  fetchMock.mockResolvedValueOnce(json({ data: { message: 'Email verified', user: null, session: null } }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))
  await userEvent.click(screen.getByRole('link', { name: 'Go to Login' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
  fetchMock.mockResolvedValueOnce(json({ data: full }))
  fetchMock.mockResolvedValue(json({ data: { bands: [] } }))
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/bands/8'))
})

it('blocks duplicate confirmations while pending and ignores results after leaving', async () => {
  const router = open()
  await screen.findByRole('button', { name: 'Confirm email' })
  let resolve
  fetchMock.mockReturnValueOnce(new Promise(done => { resolve = done }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))
  expect(screen.getByRole('button', { name: 'Confirm email' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }))
  expect(fetchMock).toHaveBeenCalledTimes(2)
  await userEvent.click(screen.getByRole('link', { name: 'Account recovery' }))
  await act(async () => { resolve(json({ data: { message: 'Email verified', ...full } })) })
  expect(router.state.location.pathname).toBe('/forgot-password')
  await act(() => router.navigate('/bands/8'))
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
})
