// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { createBandosQueryClient } from '../app/queryClient.js'
import { bandKeys } from '../features/bands/queries.js'

const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true, created_at: 'opaque' }
const member = { userId: 17, username: 'alex', firstName: 'Alex', lastName: 'Rivera', role: 'leader' }
const json = (data, status = 200) => new Response(JSON.stringify({ data }), { status })
const failure = (code, status = 400, details, headers) => new Response(JSON.stringify({ error: { code, message: 'Failed', details } }), { status, headers })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const fetchMock = vi.fn()
let band, other, remove, clients, detailRead, listRead, signedIn
const dialogDescriptors = Object.fromEntries(['showModal', 'close'].map((name) =>
  [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]))
function mount(entries = ['/bands/2/settings']) {
  const client = createBandosQueryClient()
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } })
  clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: entries, initialIndex: entries.length - 1 })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}
const writes = () => fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')
async function enter(value = 'Zebra') { fireEvent.change(await screen.findByLabelText('Band name'), { target: { value } }) }
async function openDelete() {
  await userEvent.click(await screen.findByRole('button', { name: 'Delete band' }))
  return screen.getByRole('dialog', { name: 'Delete Alpha?' })
}
async function confirm() {
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete Alpha?' })).getByRole('button', { name: 'Delete band' }))
}
beforeEach(() => {
  clients = []; signedIn = true
  band = { bandId: 2, name: 'Alpha', currentUserRole: 'leader', isActive: true, createdAt: 'opaque', members: [member] }
  other = { ...band, bandId: 3, name: 'Middle', currentUserRole: 'member' }
  detailRead = () => json({ band }); listRead = () => json({ bands: [band, other] })
  remove = () => { detailRead = () => failure('BAND_NOT_FOUND', 404); listRead = () => json({ bands: [other] }); return json({ message: 'Deleted' }) }
  fetchMock.mockReset().mockImplementation(async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return signedIn ? json({ user }) : failure('AUTHENTICATION_REQUIRED', 401)
    if (path === '/bands') return listRead()
    if (path === '/bands/2') return options.method === 'DELETE' ? remove() : detailRead()
    if (path === '/bands/3') return json({ band: other })
    if (path === '/auth/login') { signedIn = true; return json({ message: 'OK' }) }
    if (path === '/auth/logout') { signedIn = false; return json({ message: 'OK' }) }
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.removeAttribute('open') } })
})
afterEach(() => {
  cleanup(); clients.forEach((client) => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals()
  for (const [name, descriptor] of Object.entries(dialogDescriptors)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else delete HTMLDialogElement.prototype[name]
  }
})

it('focuses Cancel and restores the trigger after Cancel or Escape without deleting the draft or band', async () => {
  mount(); await enter('Draft')
  let dialog = await openDelete()
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  expect(within(dialog).getByText('Everyone will lose access to this band, its member list, and its events.')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Delete band' })).toHaveFocus()
  dialog = await openDelete(); fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('button', { name: 'Delete band' })).toHaveFocus()
  expect(screen.getByLabelText('Band name')).toHaveValue('Draft')
  expect(writes()).toHaveLength(0)
})

it('holds pending navigation, sends one bodyless delete and discards a dirty rename without a second prompt', async () => {
  const pending = deferred(); remove = () => pending.promise
  const { client, router } = mount(['/bands/2/members', '/bands/2/settings'])
  await enter('Draft'); await openDelete(); await confirm()
  const dialog = screen.getByRole('dialog', { name: 'Delete Alpha?' })
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete band' }))
  expect(writes()).toHaveLength(1)
  expect(writes()[0][1].body).toBeUndefined()
  await act(() => router.navigate(-1))
  expect(await screen.findByRole('button', { name: 'Discard changes' })).toBeDisabled()
  client.setQueryData([...bandKeys.detail(2), 'events'], ['private'])
  detailRead = () => failure('BAND_NOT_FOUND', 404); listRead = () => json({ bands: [other] })
  await act(async () => pending.resolve(json({ message: 'Deleted' })))
  await screen.findByText('Band deleted.')
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.historyAction).toBe('REPLACE')
  expect(router.state.location.state?.bandDeleted).toBeUndefined()
  expect(client.getQueryData(bandKeys.detail(2))).toBeNull()
  expect(client.getQueryData([...bandKeys.detail(2), 'events'])).toBeUndefined()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(() => router.navigate(-1))
  await screen.findByText('This band is no longer available')
  await userEvent.click(screen.getByRole('link', { name: 'Go home' }))
  expect(screen.queryByText('Band deleted.')).not.toBeInTheDocument()
  await act(() => router.navigate('/bands/2/settings'))
  await screen.findByText('This band is no longer available')
  expect(screen.queryByRole('button', { name: 'Delete band' })).not.toBeInTheDocument()
})

it('cancels late detail, list, and associated resource reads without affecting other bands', async () => {
  const { client } = mount(); await screen.findByLabelText('Band name')
  const detail = deferred(), list = deferred(), events = deferred()
  detailRead = () => detail.promise; listRead = () => list.promise
  client.setQueryData([...bandKeys.detail(3), 'events'], ['keep'])
  let reads
  act(() => { reads = Promise.allSettled([
    client.invalidateQueries({ queryKey: bandKeys.detail(2) }),
    client.invalidateQueries({ queryKey: bandKeys.list }),
    client.fetchQuery({ queryKey: [...bandKeys.detail(2), 'events'], queryFn: () => events.promise }),
  ]) })
  await openDelete(); await confirm(); await screen.findByText('Band deleted.')
  await act(async () => { detail.resolve(json({ band })); list.resolve(json({ bands: [band, other] })); events.resolve(['stale']); await reads })
  expect(client.getQueryData(bandKeys.detail(2))).toBeNull()
  expect(client.getQueryData(bandKeys.list).map((item) => item.bandId)).toEqual([3])
  expect(client.getQueryData([...bandKeys.detail(2), 'events'])).toBeUndefined()
  expect(client.getQueryData([...bandKeys.detail(3), 'events'])).toEqual(['keep'])
})

it.each(['network', 'server', 'malformed'])('rechecks an uncertain %s response and requires a new confirmation', async (mode) => {
  remove = () => { if (mode === 'network') throw new TypeError('Offline'); return mode === 'server' ? failure('INTERNAL_ERROR', 500) : json({}) }
  mount(); await openDelete(); await confirm()
  await screen.findByText('This band is still available. You can open the confirmation to try again.')
  expect(screen.queryByText('Band deleted.')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(writes()).toHaveLength(1)
  await openDelete()
  expect(writes()).toHaveLength(1)
  await confirm()
  await waitFor(() => expect(writes()).toHaveLength(2))
})

it('keeps deletion locked after a failed recheck and preserves the draft for safe navigation', async () => {
  remove = () => { detailRead = () => failure('INTERNAL_ERROR', 503); return failure('INTERNAL_ERROR', 500) }
  mount(); await enter('Draft'); await openDelete(); await confirm()
  await screen.findByRole('button', { name: 'Check again' })
  expect(screen.getByRole('button', { name: 'Delete band' })).toBeDisabled()
  expect(screen.getByLabelText('Band name')).toHaveValue('Draft')
  await userEvent.click(screen.getByRole('link', { name: 'Middle' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
  detailRead = () => json({ band })
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
  await screen.findByText('This band is still available. You can open the confirmation to try again.')
  expect(writes()).toHaveLength(1)
})

it.each(['direct', 'uncertain'])('recovers %s unavailability without claiming this request deleted the band', async (mode) => {
  remove = () => {
    detailRead = () => failure('BAND_NOT_FOUND', 404); listRead = () => json({ bands: [other] })
    return failure(mode === 'direct' ? 'BAND_NOT_FOUND' : 'INTERNAL_ERROR', mode === 'direct' ? 404 : 500)
  }
  const { client } = mount(); await enter('Draft')
  client.setQueryData([...bandKeys.detail(2), 'events'], ['private'])
  await openDelete(); await confirm(); await screen.findByText('This band is no longer available')
  expect(client.getQueryData([...bandKeys.detail(2), 'events'])).toBeUndefined()
  await userEvent.click(screen.getByRole('link', { name: 'Go home' }))
  expect(screen.queryByText('Band deleted.')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('gates member Settings and suppresses delete while role is loading', async () => {
  const pending = deferred(); detailRead = () => pending.promise
  mount(); await screen.findByText('Loading band…')
  expect(screen.queryByRole('button', { name: 'Delete band' })).not.toBeInTheDocument()
  await act(async () => pending.resolve(json({ band: { ...band, currentUserRole: 'member' } })))
  await screen.findByText('Only band leaders can access Settings.')
  expect(screen.queryByRole('button', { name: 'Delete band' })).not.toBeInTheDocument()
})

it.each(['member', 'failed'])('handles denied deletion with a %s permission check', async (mode) => {
  remove = () => {
    detailRead = () => mode === 'failed' ? failure('INTERNAL_ERROR', 503) : json({ band: { ...band, currentUserRole: 'member' } })
    return failure('LEADER_REQUIRED', 403)
  }
  mount(); await enter('Draft'); await openDelete(); await confirm()
  if (mode === 'member') await screen.findByText('Only band leaders can access Settings.')
  else {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry permissions' })).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Delete band' })).not.toBeInTheDocument()
    detailRead = () => json({ band })
    await userEvent.click(screen.getByRole('button', { name: 'Retry permissions' }))
    await screen.findByRole('button', { name: 'Delete band' })
  }
  expect(writes()).toHaveLength(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('expires the session without preserving the draft or private data', async () => {
  remove = () => failure('AUTHENTICATION_REQUIRED', 401)
  const { client } = mount(); await enter('Draft'); await openDelete(); await confirm()
  await screen.findByRole('heading', { name: 'Login' })
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(writes()).toHaveLength(1)
})
