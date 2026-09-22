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
const event = (changes = {}) => ({ eventId: 8, bandId: 2, name: 'Practice', type: 'rehearsal', date: '2030-09-16', startTime: '15:05', endTime: '16:35', timezone: 'UTC', location: 'Studio', description: null, createdByUserId: 17, isActive: true, createdAt: 'opaque', updatedAt: 'opaque', ...changes })
const json = (data, status = 200) => new Response(JSON.stringify({ data }), { status })
const failure = (code, status, details) => new Response(JSON.stringify({ error: { code, message: 'Failed', details } }), { status })
const deferred = () => { let resolve; return { promise: new Promise((done) => { resolve = done }), resolve } }
const fetchMock = vi.fn()
let clients, role, detail, patch

function mount(entry = '/bands/2/events/8/edit') {
  const client = createBandosQueryClient(); clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}
beforeEach(() => {
  clients = []; role = 'leader'; detail = event(); patch = () => json({ event: event({ name: 'Updated practice' }) })
  fetchMock.mockReset().mockImplementation(async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return json({ bands: [band(role)] })
    if (path === '/bands/2') return json({ band: band(role) })
    if (path === '/bands/2/events/8') return options.method === 'PATCH' ? patch() : json({ event: detail })
    if (path === '/bands/2/events') return json({ events: [detail] })
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); vi.unstubAllGlobals() })

it('lets a leader save one changed normalized field and opens updated detail', async () => {
  const waiting = deferred(); patch = () => waiting.promise
  const { client, router } = mount()
  expect(await screen.findByDisplayValue('Practice')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await userEvent.clear(screen.getByLabelText('Name'))
  await userEvent.type(screen.getByLabelText('Name'), '  Updated practice  ')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  fireEvent.submit(screen.getByRole('button', { name: 'Saving event…' }).closest('form'))
  const patches = fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')
  expect(patches).toHaveLength(1)
  expect(JSON.parse(patches[0][1].body)).toEqual({ name: 'Updated practice' })
  detail = event({ name: 'Updated practice' })
  await act(async () => waiting.resolve(json({ event: detail })))
  await screen.findByRole('heading', { name: 'Updated practice' })
  expect(router.state.location.pathname).toBe('/bands/2/events/8')
  expect(screen.getByRole('status')).toHaveTextContent('Event saved.')
  expect(client.getQueryData(eventKeys.detail(2, 8)).name).toBe('Updated practice')
})

it('keeps members out of the direct route and handles server closure safely', async () => {
  role = 'member'; const { router } = mount()
  await screen.findByRole('heading', { name: 'Practice' })
  expect(router.state.location.pathname).toBe('/bands/2/events/8')
  expect(screen.getByRole('status')).toHaveTextContent('Only band leaders can edit events.')
  cleanup(); role = 'leader'; patch = () => failure('EVENT_ALREADY_STARTED', 409)
  const second = mount()
  await screen.findByDisplayValue('Practice')
  await userEvent.clear(screen.getByLabelText('Name')); await userEvent.type(screen.getByLabelText('Name'), 'Updated practice')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('heading', { name: 'Practice' })
  expect(second.router.state.location.pathname).toBe('/bands/2/events/8')
  expect(screen.getByRole('status')).toHaveTextContent(/can no longer be edited/)
})

it('does not submit invalid edits and maps backend field errors', async () => {
  patch = () => failure('VALIDATION_ERROR', 400, [{ field: 'location', message: 'Server location error.' }])
  mount(); await screen.findByDisplayValue('Practice')
  await userEvent.clear(screen.getByLabelText('Location'))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Enter a location.')).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(0)
  await userEvent.type(screen.getByLabelText('Location'), 'Hall')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Server location error.')).toBeInTheDocument()
})

it.each([
  ['LEADER_REQUIRED', 403, 'Only band leaders can edit events.'],
  ['BAND_NOT_FOUND', 404, 'This band is no longer available'],
  ['AUTHENTICATION_REQUIRED', 401, 'Login'],
])('uses established recovery for %s', async (code, status, destination) => {
  patch = () => { if (code === 'LEADER_REQUIRED') role = 'member'; return failure(code, status) }
  const { router } = mount()
  await screen.findByDisplayValue('Practice')
  await userEvent.clear(screen.getByLabelText('Name'))
  await userEvent.type(screen.getByLabelText('Name'), 'Updated practice')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  if (code === 'LEADER_REQUIRED') {
    expect(await screen.findByText(destination)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/bands/2/events/8')
  } else {
    expect(await screen.findByRole('heading', { name: destination })).toBeInTheDocument()
  }
})
