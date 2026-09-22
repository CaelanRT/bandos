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
const event = (changes = {}) => ({ eventId: 8, bandId: 2, name: 'Long rehearsal', type: 'rehearsal', date: '2026-09-19', startTime: '09:05', endTime: '10:35', timezone: 'America/New_York', location: 'A very long rehearsal room location', description: 'Bring charts.', createdByUserId: 4, isActive: true, createdAt: 'opaque', updatedAt: 'opaque', ...changes })
const json = (data) => new Response(JSON.stringify({ data }), { status: 200 })
const failure = (code, status) => new Response(JSON.stringify({ error: { code, message: 'Failed' } }), { status })
const fetchMock = vi.fn()
let clients, role, detail

function mount(entry = '/bands/2/events/8') {
  const client = createBandosQueryClient()
  clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { router, client }
}

beforeEach(() => {
  clients = []; role = 'member'; detail = event(); fetchMock.mockReset()
  fetchMock.mockImplementation(async (url) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return json({ bands: [band(role)] })
    if (path === '/bands/2') return json({ band: band(role) })
    if (path === '/bands/2/events/8') return detail instanceof Response ? detail.clone() : json({ event: detail })
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); focusManager.setFocused(undefined); vi.unstubAllGlobals() })

it.each(['member', 'leader'])('shows the same complete local event detail for a %s', async (currentRole) => {
  role = currentRole; mount()
  await screen.findByRole('heading', { name: 'Long rehearsal' })
  expect(screen.getByText('Rehearsal')).toBeInTheDocument()
  expect(screen.getByText('2026-09-19')).toBeInTheDocument()
  expect(screen.getByText(/9:05/)).toBeInTheDocument()
  expect(screen.getByText(/10:35/)).toBeInTheDocument()
  expect(screen.getByText('America/New_York')).toBeInTheDocument()
  expect(screen.getByText('A very long rehearsal room location')).toBeInTheDocument()
  expect(screen.getByText('Bring charts.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to Schedule' })).toHaveAttribute('href', '/bands/2')
  expect(screen.queryByText('createdAt')).not.toBeInTheDocument()
  if (currentRole === 'member') expect(screen.queryByRole('button', { name: /Edit|Delete/ })).not.toBeInTheDocument()
  else expect(screen.getByRole('button', { name: 'Delete event' })).toBeInTheDocument()
})

it('omits an empty description and does not request malformed event IDs', async () => {
  detail = event({ description: null }); mount()
  await screen.findByRole('heading', { name: 'Long rehearsal' })
  expect(screen.queryByRole('heading', { name: 'Description' })).not.toBeInTheDocument()
  cleanup(); mount('/bands/2/events/01')
  await screen.findByRole('heading', { name: 'This event is no longer available.' })
  expect(fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/events/01'))).toHaveLength(0)
})

it('uses neutral unavailable recovery and retains cached detail through a failed refresh', async () => {
  mount(); await screen.findByRole('heading', { name: 'Long rehearsal' })
  detail = failure('EVENT_NOT_FOUND', 404)
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
  await screen.findByRole('heading', { name: 'This event is no longer available.' })
  cleanup(); detail = event({ bandId: 3 }); mount()
  await screen.findByRole("heading", { name: "This event is no longer available." })
  cleanup(); detail = event(); const { client } = mount()
  await screen.findByRole("heading", { name: "Long rehearsal" })
  detail = failure("INTERNAL_ERROR", 503)
  await act(() => client.invalidateQueries({ queryKey: ["private", "band", 2, "event", 8] }))
  await screen.findByText('We couldn’t update this event.')
  expect(screen.getByRole('heading', { name: 'Long rehearsal' })).toBeInTheDocument()
  detail = event({ name: 'Updated rehearsal' })
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('heading', { name: 'Updated rehearsal' })
})

it('redirects an expired event read through the existing protected-session boundary', async () => {
  detail = failure('AUTHENTICATION_REQUIRED', 401)
  const { router } = mount('/bands/2/events/8?from=mail#detail')
  await screen.findByRole('heading', { name: 'Login' })
  await waitFor(() => expect(router.state.location.state.destination).toBe('/bands/2/events/8?from=mail#detail'))
})
