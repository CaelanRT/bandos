// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useLayoutEffect } from 'react'
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { useSession } from '../app/sessionContext.js'
import { useActivityQuery, userActivityRequest } from '../app/activityQueries.js'
import { createBandosQueryClient } from '../app/queryClient.js'
import { useUpcomingAcrossBands } from '../features/datebook/queries.js'
import { routes } from '../app/routes.jsx'
import { sessionFixture } from './fixtures/session.js'

const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera', email: 'alex@example.com',
  plan: 'free', is_active: true, version: 1, email_verified_at: '2026-09-03T10:00:00Z', pending_email: null, created_at: '2026-09-03T10:00:00Z' }
const key = ['private', 'activity-probe']
const fetch = vi.fn()
let currentSession, client
function Probe() {
  const session = useSession()
  useLayoutEffect(() => { currentSession = session }, [session])
  const query = useActivityQuery({ queryKey: key,
    queryFn: ({ signal, activity }) => (activity === 'user' ? userActivityRequest(session.authenticatedRequest) : session.authenticatedRequest)('/probe', { signal }),
  })
  return <><span>{query.data?.message}</span><button onClick={() => query.refetch()}>Refresh</button></>
}
function response(data, status = 200) { return new Response(JSON.stringify(data), { status }) }
afterEach(() => { cleanup(); fetch.mockReset(); client?.clear(); vi.unstubAllGlobals(); focusManager.setFocused(undefined); onlineManager.setOnline(true) })

it('marks navigation and Refresh, forces cached loads, and keeps bootstrap/focus/reconnect/invalidation passive', async () => {
  fetch.mockImplementation((url) => Promise.resolve(response({ data: url.endsWith('/users/me') ? { user, session: sessionFixture } : { message: 'Loaded' } })))
  vi.stubGlobal('fetch', fetch)
  client = createBandosQueryClient()
  client.setQueryData(key, { message: 'Cached' })
  const router = createMemoryRouter([{ path: '*', element: <Probe /> }], { initialEntries: ['/'] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  await screen.findByText('Loaded')
  const headers = () => fetch.mock.calls.filter(([url]) => url.endsWith('/probe')).map(([, options]) => options.headers.get('X-bandos-activity'))
  expect(fetch.mock.calls[0][1].headers.has('X-bandos-activity')).toBe(false)
  expect(headers()).toEqual(['user'])
  await act(() => client.invalidateQueries({ queryKey: key }))
  expect(headers()).toEqual(['user', null])
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
  await waitFor(() => expect(headers()).toHaveLength(3))
  expect(headers().at(-1)).toBeNull()
  await act(async () => { onlineManager.setOnline(false); onlineManager.setOnline(true) })
  await waitFor(() => expect(headers()).toHaveLength(4))
  expect(headers().at(-1)).toBeNull()
  await act(() => screen.getByRole('button', { name: 'Refresh' }).click())
  expect(headers().at(-1)).toBe('user')
  // No intervening render is required for an invalidation to remain passive.
  await act(() => client.invalidateQueries({ queryKey: key }))
  expect(headers().at(-1)).toBeNull()
  await act(() => router.navigate('/account'))
  await waitFor(() => expect(headers()).toHaveLength(7))
  expect(headers().at(-1)).toBe('user')
})

it('downgrades EMAIL_VERIFICATION_REQUIRED, clears protected data, and rejects late private reads', async () => {
  let resolveOld
  fetch.mockImplementation(url => {
    if (url.endsWith('/users/me')) return Promise.resolve(response({ data: { user, session: sessionFixture } }))
    if (url.endsWith('/probe')) return Promise.resolve(response({ data: { message: 'Loaded' } }))
    if (url.endsWith('/slow')) return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve(response({ error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify email' } }, 403))
  })
  vi.stubGlobal('fetch', fetch)
  client = createBandosQueryClient()
  const router = createMemoryRouter([{ path: '/probe', element: <Probe /> }, ...routes], { initialEntries: ['/probe'] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  await screen.findByText('Loaded')
  const old = currentSession.authenticatedRequest('/slow').catch(error => error)
  await act(async () => { await currentSession.authenticatedRequest('/denied').catch(() => {}) })
  await act(() => router.navigate('/account'))
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  expect(client.getQueryData(key)).toBeUndefined()
  await act(async () => {
    resolveOld(response({ data: { secret: 'forbidden' } }))
    expect(await old).toMatchObject({ name: 'AbortError' })
  })
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/bands'))).toBe(false)
})

it.each([
  ['/verify-email', 'Verify your email'], ['/verify-email-change', 'Confirm your email change'],
  ['/forgot-password', 'Recover your account'], ['/reset-password', 'Reset your password'],
])('does not intercept recovery route %s when an earlier protected request expires', async (path, title) => {
  let resolveOld
  fetch.mockImplementation(url => {
    if (url.endsWith('/users/me')) return Promise.resolve(response({ data: { user, session: sessionFixture } }))
    if (url.endsWith('/probe')) return Promise.resolve(response({ data: { message: 'Loaded' } }))
    return new Promise(resolve => { resolveOld = resolve })
  })
  vi.stubGlobal('fetch', fetch)
  client = createBandosQueryClient()
  const router = createMemoryRouter([{ path: '/probe', element: <Probe /> }, ...routes], { initialEntries: ['/probe'] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  await screen.findByText('Loaded')
  const pending = currentSession.authenticatedRequest('/slow').catch(() => {})
  await act(() => router.navigate(`${path}?token=secret`))
  await act(async () => {
    resolveOld(response({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Required' } }, 401))
    await pending
  })
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(path)
  expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument()
})

function DatebookProbe() {
  const datebook = useUpcomingAcrossBands()
  return <p>{datebook.status}</p>
}

it('keeps dependent event discovery passive when a background bands read discovers a new band', async () => {
  const band = bandId => ({ bandId, name: `Band ${bandId}`, version: 1, isActive: true,
    createdAt: '2026-09-03T10:00:00Z', currentUserRole: 'member' })
  let bands = [band(1)]
  fetch.mockImplementation(url => Promise.resolve(response({ data: url.endsWith('/users/me')
    ? { user, session: sessionFixture } : url.endsWith('/bands') ? { bands } : { events: [] } })))
  vi.stubGlobal('fetch', fetch)
  client = createBandosQueryClient()
  const router = createMemoryRouter([{ path: '*', element: <DatebookProbe /> }])
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  await screen.findByText('success')
  const eventCalls = bandId => fetch.mock.calls.filter(([url]) => url.endsWith(`/bands/${bandId}/events`))
  expect(eventCalls(1)[0][1].headers.get('X-bandos-activity')).toBe('user')

  bands = [band(1), band(2)]
  await act(() => client.invalidateQueries({ queryKey: ['private', 'bands'] }))
  await waitFor(() => expect(eventCalls(2)).toHaveLength(1))
  expect(eventCalls(2)[0][1].headers.has('X-bandos-activity')).toBe(false)
  await screen.findByText('success')

  // Explicit navigation still loads both cached event lists as user activity.
  await act(() => router.navigate('/another-datebook-view'))
  await waitFor(() => expect(eventCalls(2)).toHaveLength(2))
  expect(eventCalls(2).at(-1)[1].headers.get('X-bandos-activity')).toBe('user')
})

it('keeps a newly mounted schedule passive when focus recovers a failed band load', async () => {
  const band = { bandId: 1, name: 'Recovered band', version: 1, isActive: true,
    createdAt: '2026-09-03T10:00:00Z', currentUserRole: 'member', members: [],
    instruments: [], instrumentation: [], defaultLineup: null }
  let failed = true
  fetch.mockImplementation(url => Promise.resolve(url.endsWith('/bands/1') && failed
    ? response({ error: { code: 'INTERNAL_ERROR', message: 'Unavailable' } }, 503)
    : response({ data: url.endsWith('/users/me') ? { user, session: sessionFixture }
      : url.endsWith('/bands') ? { bands: [band] } : url.endsWith('/bands/1') ? { band } : { events: [] } })))
  vi.stubGlobal('fetch', fetch)
  client = createBandosQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
  const router = createMemoryRouter(routes, { initialEntries: ['/bands/1'] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  await screen.findByText('We couldn’t load this band.')
  failed = false
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
  await screen.findByRole('heading', { name: 'Recovered band' })
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith('/bands/1/events'))).toBe(true))
  const reads = fetch.mock.calls.filter(([url]) => url.endsWith('/bands/1/events'))
  expect(reads).toHaveLength(1)
  expect(reads[0][1].headers.has('X-bandos-activity')).toBe(false)
})
