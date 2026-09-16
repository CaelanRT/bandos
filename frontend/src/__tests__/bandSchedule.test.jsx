// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { createBandosQueryClient } from '../app/queryClient.js'

const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera', email: 'alex@example.com', plan: 'free', is_active: true, created_at: 'opaque' }
const band = (role = 'member') => ({ bandId: 2, name: 'The Waves', currentUserRole: role, isActive: true, createdAt: 'opaque', members: [] })
const event = (changes = {}) => ({ eventId: 8, bandId: 2, name: 'Long rehearsal', type: 'rehearsal', date: '2030-09-16', startTime: '15:05', endTime: '16:35', timezone: 'UTC', location: 'A very long rehearsal room location', description: 'Bring charts.', createdByUserId: 4, isActive: true, createdAt: 'opaque', updatedAt: 'opaque', ...changes })
const json = (data) => new Response(JSON.stringify({ data }), { status: 200 })
const failure = (code, status) => new Response(JSON.stringify({ error: { code, message: 'Failed' } }), { status })
const deferred = () => {
  let resolve
  return { promise: new Promise((done) => { resolve = done }), resolve }
}
const fetchMock = vi.fn()
let clients, role, events, eventResponse

function mount() {
  const client = createBandosQueryClient()
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } })
  clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: ['/bands/2'] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}

beforeEach(() => {
  clients = []; role = 'member'; events = []; eventResponse = null
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return json({ bands: [band(role)] })
    if (path === '/bands/2') return json({ band: band(role) })
    if (path === '/bands/2/events') {
      const response = eventResponse ?? events
      if (response instanceof Promise) return response
      return response instanceof Response ? response.clone() : json({ events: response })
    }
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); focusManager.setFocused(undefined); vi.unstubAllGlobals() })

it.each(['member', 'leader'])('shows grouped rows and detail links for a %s without management controls', async (currentRole) => {
  role = currentRole
  events = [
    event({ eventId: 3, name: 'Later performance', type: 'performance', startTime: '18:00', endTime: '19:00', location: 'Hall' }),
    event({ eventId: 2, name: 'First rehearsal' }),
    event({ eventId: 1, name: 'Started rehearsal', date: '2020-09-15', startTime: '10:00', endTime: '11:00' }),
  ]
  mount()
  expect(await screen.findByRole('heading', { name: 'Upcoming' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Monday, September 16, 2030' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Tuesday, September 15, 2020' })).toBeInTheDocument()
  const row = screen.getByRole('link', { name: /First rehearsal/ })
  expect(row).toHaveAttribute('href', '/bands/2/events/2')
  expect(row).toHaveTextContent('3:05 PM')
  expect(row).toHaveTextContent('Rehearsal')
  expect(row).toHaveTextContent('A very long rehearsal room location')
  expect(row).not.toHaveTextContent('UTC')
  expect(row).not.toHaveTextContent('16:35')
  expect(screen.queryByRole('button', { name: /Create|Edit|Delete/ })).not.toBeInTheDocument()
})

it('keeps both empty sections distinct and retains cached rows through a failed refresh', async () => {
  mount()
  expect(await screen.findByText('No upcoming events.')).toBeInTheDocument()
  expect(screen.getByText('No past events.')).toBeInTheDocument()
  events = [event({ name: 'Cached rehearsal' })]
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
  expect(await screen.findByRole('link', { name: /Cached rehearsal/ })).toBeInTheDocument()
  events = failure('INTERNAL_ERROR', 503)
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
  expect(await screen.findByText('We couldn’t update this schedule.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Cached rehearsal/ })).toBeInTheDocument()
  events = []
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No upcoming events.')).toBeInTheDocument()
})


it("shows a retryable initial failure and rejects malformed successful schedules", async () => {
  events = failure("INTERNAL_ERROR", 503)
  mount()
  expect(await screen.findByText("We couldn’t load this schedule.")).toBeInTheDocument()
  expect(screen.queryByText("No upcoming events.")).not.toBeInTheDocument()

  events = [{ ...event(), eventId: "not-an-id" }]
  await userEvent.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("We couldn’t load this schedule.")).toBeInTheDocument()
})


it("recovers unavailable access when only the event-list request is denied", async () => {
  const { client } = mount()
  await screen.findByRole("heading", { name: "The Waves" })
  eventResponse = failure("BAND_NOT_FOUND", 404)
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
  expect(await screen.findByRole("heading", { name: "This band is no longer available" })).toBeInTheDocument()
  expect(client.getQueryData(["private", "band", 2, "events"])).toBeUndefined()
  expect(client.getQueryData(["private", "band", 2])).toBeNull()
})

it("ends the session when only the event-list request expires", async () => {
  mount()
  await screen.findByRole("heading", { name: "The Waves" })
  eventResponse = failure("AUTHENTICATION_REQUIRED", 401)
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
  expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument()
})

it('does not retain a late event-list response after leaving Schedule', async () => {
  const lateRead = deferred()
  eventResponse = lateRead.promise
  const { client } = mount()
  await screen.findByRole('heading', { name: 'The Waves' })
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/bands/2/events'))).toHaveLength(1))

  await userEvent.click(screen.getByRole('link', { name: 'Members' }))
  expect(await screen.findByRole('heading', { name: 'Members' })).toBeInTheDocument()
  lateRead.resolve(json({ events: [event({ name: 'Late rehearsal' })] }))
  await act(async () => {})

  expect(screen.queryByRole('link', { name: /Late rehearsal/ })).not.toBeInTheDocument()
  expect(client.getQueryData(['private', 'band', 2, 'events'])).toBeUndefined()
})
