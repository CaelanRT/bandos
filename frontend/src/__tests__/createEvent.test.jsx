// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { createBandosQueryClient } from '../app/queryClient.js'
import { eventKeys } from '../features/bands/queries.js'

const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera', email: 'alex@example.com', plan: 'free', is_active: true, created_at: 'opaque' }
const band = (role = 'leader') => ({ bandId: 2, name: 'The Waves', currentUserRole: role, isActive: true, createdAt: 'opaque', members: [] })
const event = { eventId: 8, bandId: 2, name: 'Practice', type: 'rehearsal', date: '2030-09-16', startTime: '15:05', endTime: '16:35', timezone: 'UTC', location: 'Studio', description: null, createdByUserId: 17, isActive: true, createdAt: 'opaque', updatedAt: 'opaque' }
const json = (data, status = 200) => new Response(JSON.stringify({ data }), { status })
const failure = (code, status, details) => new Response(JSON.stringify({ error: { code, message: 'Failed', details } }), { status })
const deferred = () => { let resolve; return { promise: new Promise((done) => { resolve = done }), resolve } }
const fetchMock = vi.fn()
let clients, role, post, permissionCheckFails

function mount(entry = '/bands/2/events/new') {
  const client = createBandosQueryClient(); clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}
async function fill() {
  await userEvent.type(await screen.findByLabelText('Name'), '  Practice  ')
  await userEvent.selectOptions(screen.getByLabelText('Type'), 'rehearsal')
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2030-09-16' } })
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '15:05' } })
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '16:35' } })
  await userEvent.type(screen.getByLabelText('Timezone'), 'UTC')
  await userEvent.type(screen.getByLabelText('Location'), '  Studio  ')
}
beforeEach(() => {
  clients = []; role = 'leader'; permissionCheckFails = false; post = () => json({ event }, 201)
  fetchMock.mockReset().mockImplementation(async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return permissionCheckFails ? failure('INTERNAL_ERROR', 503) : json({ bands: [band(role)] })
    if (path === '/bands/2') return permissionCheckFails ? failure('INTERNAL_ERROR', 503) : json({ band: band(role) })
    if (path === '/bands/2/events') return options.method === 'POST' ? post() : json({ events: [] })
    if (path === '/bands/2/events/8') return json({ event })
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); vi.unstubAllGlobals() })

it('lets a leader submit one normalized event and opens its detail', async () => {
  const waiting = deferred(); post = () => waiting.promise
  const { client, router } = mount()
  expect(await screen.findByRole('heading', { name: 'Create event' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Create event', exact: true }))
  fireEvent.submit(screen.getByRole('button', { name: 'Creating event…' }).closest('form'))
  const posts = fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')
  expect(posts).toHaveLength(1)
  expect(JSON.parse(posts[0][1].body)).toEqual({
    name: 'Practice', type: 'rehearsal', date: '2030-09-16', startTime: '15:05', endTime: '16:35', timezone: 'UTC', location: 'Studio', description: null,
  })
  await act(async () => waiting.resolve(json({ event }, 201)))
  await screen.findByRole('heading', { name: 'Practice' })
  expect(router.state.location.pathname).toBe('/bands/2/events/8')
  expect(screen.getByRole('status')).toHaveTextContent('Event created.')
  expect(client.getQueryData(eventKeys.detail(2, 8))).toEqual(event)
})

it('rejects member direct access and does not submit invalid schedule values', async () => {
  role = 'member'; mount()
  await screen.findByText('Only band leaders can create events.')
  expect(screen.queryByRole('heading', { name: 'Create event' })).not.toBeInTheDocument()
  cleanup(); role = 'leader'; mount()
  await screen.findByRole('heading', { name: 'Create event' })
  await userEvent.click(screen.getByRole('button', { name: 'Create event', exact: true }))
  expect(await screen.findByText('Choose a date.')).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0)
})

it('retains a draft and warns before a deliberate retry after an uncertain outcome', async () => {
  post = () => failure('INTERNAL_ERROR', 500)
  mount(); await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Create event', exact: true }))
  expect(await screen.findByText(/couldn’t confirm whether this event was created/)).toBeInTheDocument()
  expect(screen.getByLabelText('Name')).toHaveValue('  Practice  ')
  expect(screen.getByText(/may create a duplicate event/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create again' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'Create again' }))
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(2)
})

it('maps backend field validation and protects a dirty Cancel navigation', async () => {
  post = () => failure('VALIDATION_ERROR', 400, [{ field: 'timezone', message: 'Server timezone error.' }])
  const { router } = mount(); await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Create event', exact: true }))
  expect(await screen.findByText('Server timezone error.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(router.state.location.pathname).toBe('/bands/2')
})

it.each([
  ['LEADER_REQUIRED', 403, 'Only band leaders can create events.'],
  ['BAND_NOT_FOUND', 404, 'This band is no longer available'],
  ['AUTHENTICATION_REQUIRED', 401, 'Login'],
])('uses established recovery for %s', async (code, status, destination) => {
  post = () => { if (code === 'LEADER_REQUIRED') role = 'member'; return failure(code, status) }
  mount(); await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Create event', exact: true }))
  if (code === 'LEADER_REQUIRED') {
    expect(await screen.findByText(destination)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/bands/2'))).toHaveLength(2)
    expect(fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/bands'))).toHaveLength(2)
  } else expect(await screen.findByRole('heading', { name: destination })).toBeInTheDocument()
})

it('keeps a remounted Create route suppressed after a failed permission check', async () => {
  post = () => { permissionCheckFails = true; return failure('LEADER_REQUIRED', 403) }
  const { router } = mount(); await fill()
  await userEvent.click(screen.getByRole('button', { name: 'Create event', exact: true }))
  expect(await screen.findByRole('button', { name: 'Retry permissions' })).toBeInTheDocument()
  await act(() => router.navigate('/bands/2'))
  await screen.findByRole('heading', { name: 'The Waves' })
  await act(() => router.navigate('/bands/2/events/new'))
  expect(await screen.findByRole('button', { name: 'Retry permissions' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
})
