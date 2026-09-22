// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { createBandosQueryClient } from '../app/queryClient.js'
import { eventKeys } from '../features/bands/queries.js'

const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera', email: 'alex@example.com', plan: 'free', is_active: true, created_at: 'opaque' }
const band = (role = 'leader') => ({ bandId: 2, name: 'The Waves', currentUserRole: role, isActive: true, createdAt: 'opaque', members: [] })
const event = { eventId: 8, bandId: 2, name: 'Old rehearsal', type: 'rehearsal', date: '2020-09-16', startTime: '15:05', endTime: '16:35', timezone: 'UTC', location: 'Studio', description: null, createdByUserId: 17, isActive: true, createdAt: 'opaque', updatedAt: 'opaque' }
const json = (data) => new Response(JSON.stringify({ data }), { status: 200 })
const failure = (code, status) => new Response(JSON.stringify({ error: { code, message: 'Failed' } }), { status })
const deferred = () => { let settle; const promise = new Promise((resolve) => { settle = resolve }); return { promise, resolve: settle } }
const fetchMock = vi.fn()
let clients, role, deleted, deleteResponse

function mount(entry = '/bands/2/events/8') {
  const client = createBandosQueryClient(); clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}

beforeEach(() => {
  clients = []; role = 'leader'; deleted = false; deleteResponse = () => json({ message: 'Event deleted' })
  fetchMock.mockReset().mockImplementation(async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return json({ bands: [band(role)] })
    if (path === '/bands/2') return json({ band: band(role) })
    if (path === '/bands/2/events/8') {
      if (options.method === 'DELETE') {
        expect(options.body).toBeUndefined()
        const response = await deleteResponse()
        if (response.ok) deleted = true
        return response
      }
      return deleted ? failure('EVENT_NOT_FOUND', 404) : json({ event })
    }
    if (path === '/bands/2/events') return json({ events: deleted ? [] : [event] })
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); vi.unstubAllGlobals() })

it('lets leaders delete historical events once, removes cached event data, and returns to Schedule', async () => {
  const { client, router } = mount()
  await screen.findByRole('heading', { name: 'Old rehearsal' })
  await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete Old rehearsal?' })
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete event' }))
  await screen.findByRole('heading', { name: 'The Waves' })
  expect(router.state.location.pathname).toBe('/bands/2')
  expect(screen.getByText(/Event deleted\./)).toBeInTheDocument()
  expect(client.getQueryData(eventKeys.detail(2, 8))).toBeNull()
  expect(client.getQueryData(eventKeys.list(2))).toEqual([])
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText(/Event deleted/)).not.toBeInTheDocument()
})

it('lets Cancel or Escape close confirmation without deleting', async () => {
  mount(); await screen.findByRole('heading', { name: 'Old rehearsal' })
  const trigger = screen.getByRole('button', { name: 'Delete event' })
  await userEvent.click(trigger)
  let dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(trigger).toHaveFocus()
  await userEvent.click(trigger); dialog = await screen.findByRole('dialog')
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(0)
})

it('prevents another DELETE request while the first request is pending', async () => {
  const waiting = deferred()
  deleteResponse = () => waiting.promise
  mount(); await screen.findByRole('heading', { name: 'Old rehearsal' })
  await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
  const dialog = await screen.findByRole('dialog')
  const confirm = within(dialog).getByRole('button', { name: 'Delete event' })
  await userEvent.click(confirm)
  expect(await within(dialog).findByText('Deleting event…')).toBeInTheDocument()
  expect(confirm).toBeDisabled()
  fireEvent.click(confirm)
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(1)
  await act(async () => waiting.resolve(json({ message: 'Event deleted' })))
  await screen.findByText(/Event deleted\./)
})

it('hides Delete from members and keeps failed deletion unconfirmed without retry', async () => {
  role = 'member'; mount(); await screen.findByRole('heading', { name: 'Old rehearsal' })
  expect(screen.queryByRole('button', { name: 'Delete event' })).not.toBeInTheDocument()
  cleanup(); role = 'leader'; deleteResponse = () => failure('INTERNAL_ERROR', 500)
  mount(); await screen.findByRole('heading', { name: 'Old rehearsal' })
  await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete event' }))
  expect(await screen.findByText(/couldn’t confirm that the event was deleted/)).toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(1)
})

it('uses neutral unavailable state after a not-found response', async () => {
  deleteResponse = () => failure('EVENT_NOT_FOUND', 404)
  mount(); await screen.findByRole('heading', { name: 'Old rehearsal' })
  await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete event' }))
  expect(await screen.findByRole('heading', { name: 'This event is no longer available.' })).toBeInTheDocument()
})

it('refreshes permissions after leader access is denied by the server', async () => {
  deleteResponse = () => { role = 'member'; return failure('LEADER_REQUIRED', 403) }
  mount(); await screen.findByRole('heading', { name: 'Old rehearsal' })
  await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete event' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Only band leaders can manage events.')
  expect(screen.queryByRole('button', { name: 'Delete event' })).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.replace('/api/v1', '') === '/bands/2')).toHaveLength(2)
})

it('uses the protected session recovery after authentication expires', async () => {
  const { router } = mount('/bands/2/events/8?from=mail')
  await screen.findByRole('heading', { name: 'Old rehearsal' })
  deleteResponse = () => failure('AUTHENTICATION_REQUIRED', 401)
  await userEvent.click(screen.getByRole('button', { name: 'Delete event' }))
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete event' }))
  await screen.findByRole('heading', { name: 'Login' })
  expect(router.state.location.state.destination).toBe('/bands/2/events/8?from=mail')
})
