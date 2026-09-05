// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { SessionRoutes } from '../app/SessionRoutes.jsx'
import { ProtectedRoute, SignedOutOnlyRoute } from '../app/RouteAccess.jsx'
import { AppShell } from '../app/AppShell.jsx'
import { Login, Register } from '../app/RouteViews.jsx'
import { useSession } from '../app/sessionContext.js'
import { createBandosQueryClient } from '../app/queryClient.js'

const fetchMock = vi.fn()
const backendUser = {
  user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true,
  created_at: '2026-09-03T10:00:00Z',
}
let currentSession
function response(data, status = 200) { return new Response(JSON.stringify(data), { status }) }
function identity() { return response({ data: { user: backendUser } }) }
function failure(code = 'AUTHENTICATION_REQUIRED', status = 401) {
  return response({ error: { code, message: 'Failed request' } }, status)
}
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function Probe() {
  const session = useSession()
  useEffect(() => { currentSession = session }, [session])
  return null
}
function ProtectedPage() {
  return <AppShell><h1>Private page</h1><label>Unsaved note<input name="note" /></label></AppShell>
}
function mount(entry = '/bands/8/events/21?view=details#notes', client = createBandosQueryClient()) {
  const router = createMemoryRouter([{
    element: <SessionRoutes />,
    children: [
      { path: '/login', element: <SignedOutOnlyRoute><Login /></SignedOutOnlyRoute> },
      { path: '/register', element: <SignedOutOnlyRoute><Register /></SignedOutOnlyRoute> },
      { path: '*', element: <ProtectedRoute><ProtectedPage /></ProtectedRoute> },
    ],
  }], { initialEntries: [entry] })
  const view = render(<QueryClientProvider client={client}><SessionBoundary><Probe /><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { router, client, ...view }
}
async function open(entry) {
  fetchMock.mockResolvedValueOnce(identity())
  const app = mount(entry)
  await screen.findByRole('heading', { name: 'Private page' })
  app.client.setQueryData(['private', 'bands'], ['private data'])
  app.client.setQueryData(['public', 'config'], ['public data'])
  return app
}
async function login() {
  fetchMock.mockResolvedValueOnce(response({ message: 'Signed in' })).mockResolvedValueOnce(identity())
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  await screen.findByRole('heading', { name: 'Private page' })
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('logs out once without a body, retains content while pending, clears private data and replaces to Login', async () => {
  const { router, client } = await open()
  const pending = deferred()
  fetchMock.mockReturnValueOnce(pending.promise)
  const button = screen.getByRole('button', { name: 'Log out' })
  button.focus()
  await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Logging out…' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Logging out…')
  expect(currentSession.user.userId).toBe(17)
  expect(client.getQueryData(['private', 'bands'])).toEqual(['private data'])
  fireEvent.click(button)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/logout$/)
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'include' })
  expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('body')
  await act(async () => pending.resolve(response({ data: { message: 'Logged out' } })))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(currentSession.user).toBeNull()
  expect(client.getQueryData(['private', 'bands'])).toBeUndefined()
  expect(client.getQueryData(['public', 'config'])).toEqual(['public data'])
  expect(router.state.location.state).toEqual({})
  expect(router.state.historyAction).toBe('REPLACE')
  expect(screen.getByRole('status')).toHaveTextContent('You’ve been logged out.')
  await act(() => router.navigate(-1))
  expect(screen.queryByRole('heading', { name: 'Private page' })).not.toBeInTheDocument()
})

it.each(['server', 'network', 'unauthenticated'])('retains identity and private cache after %s Logout failure and offers Retry', async (kind) => {
  const { client } = await open()
  if (kind === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Offline'))
  else fetchMock.mockResolvedValueOnce(kind === 'server' ? failure('INTERNAL_ERROR', 500) : failure())
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t log you out. Try again.')
  expect(screen.getByRole('alert')).toHaveFocus()
  expect(currentSession.user.userId).toBe(17)
  expect(client.getQueryData(['private', 'bands'])).toEqual(['private data'])
  fetchMock.mockResolvedValueOnce(response({ data: { message: 'Logged out' } }))
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(client.getQueryData(['private', 'bands'])).toBeUndefined()
})

it('converges concurrent expiration signals and restores the deep URL without replaying the interrupted action', async () => {
  const { client, router } = await open()
  fireEvent.change(screen.getByLabelText('Unsaved note'), { target: { value: 'discard this' } })
  const first = deferred()
  const second = deferred()
  fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const requests = [currentSession.authenticatedRequest('/bands/8'), currentSession.authenticatedRequest('/bands/8/events/21', { method: 'PATCH', body: { title: 'changed' } })]
  const settled = Promise.allSettled(requests)
  await act(async () => { first.resolve(failure()); second.resolve(failure()); await settled })
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(screen.getAllByText('Your session expired. Log in to continue.')).toHaveLength(1)
  expect(currentSession.user).toBeNull()
  expect(client.getQueryData(['private', 'bands'])).toBeUndefined()
  expect(client.getQueryData(['public', 'config'])).toEqual(['public data'])
  expect(router.state.location.state).toEqual({ destination: '/bands/8/events/21?view=details#notes' })
  expect(router.state.historyAction).toBe('REPLACE')
  await login()
  expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe('/bands/8/events/21?view=details#notes')
  expect(screen.getByLabelText('Unsaved note')).toHaveValue('')
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(1)
})

it.each([['INVALID_CREDENTIALS', 401], ['AUTHENTICATION_REQUIRED', 403]])('does not expire on %s with status %s', async (code, status) => {
  const { client } = await open()
  fetchMock.mockResolvedValueOnce(failure(code, status))
  await act(async () => { await expect(currentSession.authenticatedRequest('/bands')).rejects.toMatchObject({ code }) })
  expect(currentSession.status).toBe('authenticated')
  expect(client.getQueryData(['private', 'bands'])).toEqual(['private data'])
})

it.each(['loggedOut', 'expired'])('consumes the %s notice so refresh and form navigation do not replay it', async (reason) => {
  const { router, unmount } = await open()
  fetchMock.mockResolvedValueOnce(reason === 'loggedOut' ? response({ data: { message: 'Logged out' } }) : failure())
  await act(async () => {
    if (reason === 'loggedOut') await currentSession.logOut()
    else await currentSession.authenticatedRequest('/bands').catch(() => {})
  })
  await screen.findByRole('heading', { name: 'Login' })
  await waitFor(() => expect(router.state.location.state).not.toHaveProperty('notice'))
  const refreshedEntry = router.state.location
  unmount()
  fetchMock.mockResolvedValueOnce(failure())
  mount(refreshedEntry)
  await screen.findByRole('heading', { name: 'Login' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('does not let an old expiration report sign out a newly authenticated session', async () => {
  await open()
  const old = deferred()
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(failure())
  const oldRequest = currentSession.authenticatedRequest('/old').catch(() => {})
  await act(async () => { await currentSession.authenticatedRequest('/current').catch(() => {}) })
  await screen.findByRole('heading', { name: 'Login' })
  await login()
  await act(async () => { old.resolve(failure()); await oldRequest })
  expect(currentSession.status).toBe('authenticated')
})

it('removes pending private queries and rejects stale successful responses after Logout', async () => {
  const { client } = await open()
  const pending = deferred()
  fetchMock.mockReturnValueOnce(pending.promise)
  const request = currentSession.authenticatedRequest
  const query = client.fetchQuery({ queryKey: ['private', 'pending'], queryFn: () => request('/slow') }).catch(() => {})
  fetchMock.mockResolvedValueOnce(response({ data: { message: 'Logged out' } }))
  await act(async () => { await currentSession.logOut() })
  await screen.findByRole('heading', { name: 'Login' })
  await act(async () => { pending.resolve(response({ data: ['stale private result'] })); await query })
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})


it('restores an expired destination through Registration and consumes the notice when switching forms', async () => {
  const { router } = await open()
  fetchMock.mockResolvedValueOnce(failure())
  await act(async () => { await currentSession.authenticatedRequest('/bands').catch(() => {}) })
  await screen.findByRole('heading', { name: 'Login' })
  await userEvent.click(screen.getByRole('link', { name: 'Register' }))
  await act(() => router.navigate(-1))
  expect(screen.queryByText('Your session expired. Log in to continue.')).not.toBeInTheDocument()
  await act(() => router.navigate(1))
  expect(router.state.location.pathname).toBe('/register')
  fetchMock.mockResolvedValueOnce(response({ message: 'Created' }, 201)).mockResolvedValueOnce(identity())
  for (const [label, value] of Object.entries({ 'First name': 'Alex', 'Last name': 'Rivera', Username: 'alex', Email: 'alex@example.com', Password: 'password' })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByRole('heading', { name: 'Private page' })
  expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe('/bands/8/events/21?view=details#notes')
})

it('falls back to root when expiration occurs on an unrecognized URL', async () => {
  const { router } = await open('/unknown')
  fetchMock.mockResolvedValueOnce(failure())
  await act(async () => { await currentSession.authenticatedRequest('/bands').catch(() => {}) })
  await screen.findByRole('heading', { name: 'Login' })
  expect(router.state.location.state).toEqual({ destination: '/' })
})

it('deduplicates shared Logout calls and ignores a late Logout success after reauthentication', async () => {
  await open()
  const pending = deferred()
  fetchMock.mockReturnValueOnce(pending.promise)
  const first = currentSession.logOut()
  expect(currentSession.logOut()).toBe(first)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  fetchMock.mockResolvedValueOnce(failure())
  await act(async () => { await currentSession.authenticatedRequest('/bands').catch(() => {}) })
  await screen.findByRole('heading', { name: 'Login' })
  await login()
  await act(async () => { pending.resolve(response({ data: { message: 'Logged out' } })); await first })
  expect(currentSession.status).toBe('authenticated')
})
