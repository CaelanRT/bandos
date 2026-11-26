// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '../app/routes.jsx'
import { createBandosQueryClient } from '../app/queryClient.js'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { sessionFixture } from './fixtures/session.js'

const fetchMock = vi.fn()
const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera', email: 'alex@example.com',
  plan: 'free', is_active: true, version: 3, email_verified_at: '2026-09-03T10:00:00Z', pending_email: null, created_at: '2026-09-03T10:00:00Z' }
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers })
const success = () => json({ data: { message: 'Password updated; please log in again' } })
const failure = (code, status = 400, headers = {}) => json({ error: { code, message: code } }, status, headers)
const generic = 'If eligible, a password reset email has been queued'
function mount(entry, authenticated = false) {
  fetchMock.mockImplementation((url) => Promise.resolve(url.endsWith('/bands') ? json({ data: { bands: [] } }) :
    authenticated ? json({ data: { user, session: sessionFixture } }) : failure('AUTHENTICATION_REQUIRED', 401)))
  const client = createBandosQueryClient()
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { router, client }
}
const changes = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/users/me/password'))
const resets = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/password/reset'))
function fill(password = ' new password ', confirmation = password, current = false) {
  if (current) fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old password' } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } })
}
async function openAccount() {
  const context = mount('/account', true)
  await screen.findByRole('heading', { name: 'Account' })
  fill(' new password ', ' new password ', true)
  return context
}
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it.each(['alex@example.com', 'unknown@example.com', 'inactive@example.com'])('uses generic recovery confirmation and an exact key-free body for %s', async email => {
  mount('/forgot-password')
  await screen.findByRole('heading', { name: 'Forgot password' })
  fetchMock.mockResolvedValueOnce(json({ data: { message: generic } }, 202))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ` ${email.toUpperCase()} ` } })
  await userEvent.click(screen.getByRole('button', { name: 'Request reset link' }))
  expect(await screen.findByRole('status')).toHaveTextContent(generic)
  expect(screen.getByRole('status')).toHaveTextContent('only the newest reset link works')
  const [, options] = fetchMock.mock.calls.at(-1)
  expect(JSON.parse(options.body)).toEqual({ email })
  expect(options.headers.has('Idempotency-Key')).toBe(false)
})

it('distinguishes mail issuance failure and honors Retry-After without claiming success', async () => {
  mount('/forgot-password')
  await screen.findByLabelText('Email')
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } })
  fetchMock.mockResolvedValueOnce(failure('MAIL_UNAVAILABLE', 503))
  await userEvent.click(screen.getByRole('button', { name: 'Request reset link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No reset link was issued')
  fetchMock.mockResolvedValueOnce(failure('TOO_MANY_ATTEMPTS', 429, { 'Retry-After': '60' }))
  await userEvent.click(screen.getByRole('button', { name: 'Request reset link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again after')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Request reset link' })).toBeDisabled()
  const count = fetchMock.mock.calls.length
  fireEvent.submit(screen.getByLabelText('Email').closest('form'))
  expect(fetchMock).toHaveBeenCalledTimes(count)
})

it.each([false, true])('requires explicit token submission and clears session/cache after reset (signed in: %s)', async authenticated => {
  const { router, client } = mount('/reset-password?token=secret#fragment', authenticated)
  await screen.findByLabelText('New password')
  expect(router.state.location.search).toBe('')
  expect(router.state.location.hash).toBe('')
  expect(JSON.stringify(router.state.location.state)).not.toContain('secret')
  expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
  expect(resets()).toHaveLength(0)
  client.setQueryData(['private', 'secret'], { sensitive: true })
  fill()
  const toggle = screen.getAllByRole('button', { name: 'Show password' })[0]
  expect(toggle).toHaveAttribute('aria-controls', 'password-newPassword')
  await userEvent.click(toggle)
  expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
  fetchMock.mockResolvedValueOnce(success())
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Password reset. Log in again.')
  expect(resets()).toHaveLength(1)
  const options = resets()[0][1]
  expect(JSON.parse(options.body)).toEqual({ token: 'secret', newPassword: ' new password ' })
  expect(options.headers.has('Idempotency-Key')).toBe(false)
  expect(client.getQueryData(['private', 'secret'])).toBeUndefined()
  await act(() => router.navigate('/account'))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
})

it('validates minimum length, UTF-8 byte bounds, and confirmation locally without truncation', async () => {
  mount('/reset-password?token=secret')
  await screen.findByLabelText('New password')
  fill('short')
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
  expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
  fill('é'.repeat(37))
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
  expect(screen.getByText('Use at most 72 UTF-8 bytes.')).toBeInTheDocument()
  fill('é'.repeat(36), 'different')
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
  expect(screen.getByText('Passwords must match.')).toBeInTheDocument()
  expect(resets()).toHaveLength(0)
  fill('é'.repeat(36))
  fetchMock.mockResolvedValueOnce(success())
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findByRole('heading', { name: 'Login' })
  expect(JSON.parse(resets()[0][1].body).newPassword).toBe('é'.repeat(36))
})

it.each(['TOKEN_INVALID_OR_EXPIRED', 'network'])('offers fresh recovery after %s without consuming again', async code => {
  mount('/reset-password?token=secret')
  await screen.findByLabelText('New password')
  fill()
  if (code === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Disconnected'))
  else fetchMock.mockResolvedValueOnce(failure(code))
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveFocus()
  expect(alert).toHaveTextContent(code === 'network' ? 'may already have changed' : 'invalid, expired or already used')
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Request a fresh reset link' })).toHaveAttribute('href', '/forgot-password')
  expect(resets()).toHaveLength(1)
})

it('keeps wrong current password as a field error, then signs out and clears private state on successful keyed change', async () => {
  const { client } = await openAccount()
  client.setQueryData(['private', 'secret'], 'sensitive')
  fetchMock.mockResolvedValueOnce(failure('CURRENT_PASSWORD_INCORRECT', 403))
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
  expect(screen.getByLabelText('Current password')).toHaveAccessibleDescription('Current password is incorrect.')
  expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
  expect(client.getQueryData(['private', 'secret'])).toBe('sensitive')
  fetchMock.mockResolvedValueOnce(success())
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('All devices were signed out')
  expect(client.getQueryData(['private', 'secret'])).toBeUndefined()
  const first = changes()[0][1], second = changes()[1][1]
  expect(JSON.parse(second.body)).toEqual({ expectedVersion: 3, currentPassword: 'old password', newPassword: ' new password ' })
  expect(second.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
  expect(second.headers.get('Idempotency-Key')).not.toBe(first.headers.get('Idempotency-Key'))
})

it('requires deliberate stale recovery, discards passwords, and adopts the refreshed version', async () => {
  await openAccount()
  fetchMock.mockResolvedValueOnce(failure('STALE_VERSION', 409))
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  await screen.findByRole('button', { name: 'Reload latest' })
  expect(screen.getByLabelText('New password')).toBeDisabled()
  expect(changes()).toHaveLength(1)
  fetchMock.mockResolvedValueOnce(json({ data: { user: { ...user, version: 4 }, session: sessionFixture } }))
  await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
  expect(screen.getByText('Discard your unsaved changes and load the latest record?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes and reload' }))
  await waitFor(() => expect(screen.getByLabelText('New password')).toHaveValue(''))
  fill('new password', 'new password', true)
  fetchMock.mockResolvedValueOnce(success())
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  await screen.findByRole('heading', { name: 'Login' })
  expect(JSON.parse(changes()[1][1].body).expectedVersion).toBe(4)
})

it('retries an uncertain authenticated change with exactly the same body and key', async () => {
  await openAccount()
  fetchMock.mockRejectedValueOnce(new TypeError('Disconnected'))
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  await screen.findByRole('button', { name: 'Retry same request' })
  expect(screen.getByText(/does not mean the first change failed/)).toBeInTheDocument()
  expect(screen.getByLabelText('Current password')).toBeDisabled()
  fetchMock.mockResolvedValueOnce(success())
  await userEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
  await screen.findByRole('heading', { name: 'Login' })
  expect(changes()[1][1].body).toBe(changes()[0][1].body)
  expect(changes()[1][1].headers.get('Idempotency-Key')).toBe(changes()[0][1].headers.get('Idempotency-Key'))
})

it('treats authentication expiry during change as session loss and removes password drafts', async () => {
  const { client } = await openAccount()
  client.setQueryData(['private', 'secret'], 'sensitive')
  fetchMock.mockResolvedValueOnce(failure('AUTHENTICATION_REQUIRED', 401))
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  await screen.findByRole('heading', { name: 'Login' })
  expect(screen.getByRole('status')).toHaveTextContent('Your session expired')
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  expect(client.getQueryData(['private', 'secret'])).toBeUndefined()
})

it('does not retain reset tokens or password drafts after navigation', async () => {
  const { router } = mount('/reset-password?token=secret')
  await screen.findByLabelText('New password')
  fill()
  await userEvent.click(screen.getByRole('link', { name: 'Request a fresh reset link' }))
  await screen.findByRole('heading', { name: 'Forgot password' })
  await act(() => router.navigate(-1))
  await screen.findByRole('heading', { name: 'Reset password' })
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  expect(resets()).toHaveLength(0)
})

it('blocks duplicate reset submission while pending and respects a reset cooldown', async () => {
  mount('/reset-password?token=secret')
  await screen.findByLabelText('New password')
  fill()
  let resolve
  fetchMock.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const form = screen.getByLabelText('New password').closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(resets()).toHaveLength(1)
  expect(screen.getByLabelText('New password')).toBeDisabled()
  await act(() => resolve(failure('TOO_MANY_ATTEMPTS', 429, { 'Retry-After': '60' })))
  expect(screen.getByRole('alert')).toHaveTextContent('Try again after')
  expect(screen.getByRole('button', { name: 'Reset password' })).toBeDisabled()
  fireEvent.submit(form)
  expect(resets()).toHaveLength(1)
})

it('discards authenticated password drafts when leaving Account', async () => {
  const { router } = await openAccount()
  await act(() => router.navigate('/forgot-password'))
  await screen.findByRole('heading', { name: 'Forgot password' })
  await act(() => router.navigate('/account'))
  await screen.findByRole('heading', { name: 'Account' })
  expect(screen.getByLabelText('Current password')).toHaveValue('')
  expect(screen.getByLabelText('New password')).toHaveValue('')
  expect(screen.getByLabelText('Confirm new password')).toHaveValue('')
  expect(changes()).toHaveLength(0)
})

it.each(['pending', 'uncertain'])('guards navigation while an authenticated password change is %s', async state => {
  const { router } = await openAccount()
  let resolve
  if (state === 'pending') fetchMock.mockReturnValueOnce(new Promise(done => { resolve = done }))
  else fetchMock.mockRejectedValueOnce(new TypeError('Disconnected'))
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
  if (state === 'uncertain') await screen.findByRole('button', { name: 'Retry same request' })
  await act(() => router.navigate('/forgot-password'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  expect(router.state.location.pathname).toBe('/account')
  expect(screen.getByRole('dialog')).toHaveTextContent(state === 'pending' ? 'Please wait for the result' : 'previous save may have completed')
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  if (state === 'pending') await act(() => resolve(success()))
  else {
    fetchMock.mockResolvedValueOnce(success())
    await userEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
    expect(changes()[1][1].headers.get('Idempotency-Key')).toBe(changes()[0][1].headers.get('Idempotency-Key'))
  }
  await screen.findByRole('heading', { name: 'Login' })
})
