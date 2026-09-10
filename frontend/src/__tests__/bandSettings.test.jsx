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
let band, other, patch, clients, detailRead, listRead, signedIn
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
const writes = () => fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')
async function enter(value = 'Zebra') { fireEvent.change(await screen.findByLabelText('Band name'), { target: { value } }) }
async function save() { await userEvent.click(screen.getByRole('button', { name: 'Save', exact: true })) }
beforeEach(() => {
  clients = []; signedIn = true
  band = { bandId: 2, name: 'Alpha', currentUserRole: 'leader', isActive: true, createdAt: 'opaque', members: [member] }
  other = { ...band, bandId: 3, name: 'Middle', currentUserRole: 'member' }
  detailRead = () => json({ band }); listRead = () => json({ bands: [band, other] })
  patch = (body) => { band = { ...band, name: body.name }; return json({ band }) }
  fetchMock.mockReset().mockImplementation(async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return signedIn ? json({ user }) : failure('AUTHENTICATION_REQUIRED', 401)
    if (path === '/bands') return listRead()
    if (path === '/bands/2') return options.method === 'PATCH' ? patch(JSON.parse(options.body)) : detailRead()
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

it('prefills, saves one exact normalized request, reorders names, and resets the baseline on the same URL', async () => {
  const { client, router } = mount()
  expect(await screen.findByLabelText('Band name')).toHaveValue('Alpha')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await enter('  Zebra  '); await save()
  await screen.findByText('Band name saved.')
  expect(writes()).toHaveLength(1)
  expect(JSON.parse(writes()[0][1].body)).toEqual({ name: 'Zebra' })
  expect(client.getQueryData(bandKeys.detail(2)).name).toBe('Zebra')
  expect(screen.getByRole('heading', { name: 'Zebra' })).toBeInTheDocument()
  expect(within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Middle', 'Zebra'])
  expect(router.state.location.pathname).toBe('/bands/2/settings')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(router.state.location.pathname).toBe('/bands/2')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('gates loading and member direct entry using detail rather than a leader list summary', async () => {
  const loading = deferred(); detailRead = () => loading.promise
  const { router } = mount()
  await screen.findByText('Loading band…')
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument()
  await act(async () => loading.resolve(json({ band: { ...band, currentUserRole: 'member' } })))
  await screen.findByText('Only band leaders can access Settings.')
  expect(router.state.location.pathname).toBe('/bands/2')
  expect(router.state.historyAction).toBe('REPLACE')
  expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
})

it('restores a Settings destination with query/hash after Login', async () => {
  signedIn = false
  const { router } = mount(['/bands/2/settings?from=home#name'])
  await screen.findByRole('heading', { name: 'Login' })
  await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'password')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  await screen.findByLabelText('Band name')
  expect(router.state.location).toMatchObject({ pathname: '/bands/2/settings', search: '?from=home', hash: '#name' })
})

it('validates trimmed 1–50 JS characters on blur/edit and submit', async () => {
  mount(); await screen.findByLabelText('Band name')
  await enter(' '); fireEvent.blur(screen.getByLabelText('Band name'))
  expect(screen.getByText('Enter a band name.')).toBeInTheDocument()
  await save(); expect(screen.getByLabelText('Band name')).toHaveFocus()
  await enter('😀'.repeat(25) + 'a'); await save()
  expect(screen.getByText('Use 50 characters or fewer.')).toBeInTheDocument()
  expect(writes()).toHaveLength(0)
  await enter(' ' + '😀'.repeat(25) + ' '); await save()
  await screen.findByText('Band name saved.')
  expect(JSON.parse(writes()[0][1].body)).toEqual({ name: '😀'.repeat(25) })
})

it.each(['Cancel', 'member band', 'leader band', 'Back'])('protects dirty %s navigation with Keep/Discard and Schedule destinations', async (action) => {
  if (action === 'leader band') other.currentUserRole = 'leader'
  const { router } = mount(['/bands/2', '/bands/2/settings'])
  await enter()
  if (action === 'Cancel') await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  else if (action === 'Back') await act(() => router.navigate(-1))
  else await userEvent.click(screen.getByRole('link', { name: 'Middle' }))
  expect(await screen.findByRole('button', { name: 'Keep editing' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Band name')).toHaveValue('Zebra')
  expect(router.state.location.pathname).toBe('/bands/2/settings')
  if (action === 'Cancel') await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  else if (action === 'Back') await act(() => router.navigate(-1))
  else await userEvent.click(screen.getByRole('link', { name: 'Middle' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
  await waitFor(() => expect(router.state.location.pathname).toBe(action.endsWith('band') ? '/bands/3' : '/bands/2'))
  expect(await screen.findByRole('heading', { name: 'Schedule' })).toBeInTheDocument()
})

it('updates untouched input on refresh while retaining edited drafts and active-link context', async () => {
  const { client, router } = mount(); await screen.findByLabelText('Band name')
  band = { ...band, name: 'Server one' }
  await act(() => client.invalidateQueries({ queryKey: bandKeys.detail(2) }))
  await waitFor(() => expect(screen.getByLabelText('Band name')).toHaveValue('Server one'))
  await enter('Draft')
  band = { ...band, name: 'Server two' }
  await act(() => client.invalidateQueries({ queryKey: bandKeys.detail(2) }))
  expect(screen.getByLabelText('Band name')).toHaveValue('Draft')
  expect(await screen.findByRole('heading', { name: 'Server two' })).toBeInTheDocument()
  const key = router.state.location.key
  await userEvent.click(screen.getByRole('link', { name: 'Settings' }))
  expect(router.state.location.key).toBe(key)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('waits for a pending save before resuming navigation and prevents duplicate writes', async () => {
  const pending = deferred(); patch = () => pending.promise
  const { router } = mount(); await enter(); await save()
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('form', { name: 'Rename band' }))
  expect(writes()).toHaveLength(1)
  await userEvent.click(screen.getByRole('link', { name: 'Middle' }))
  expect(await screen.findByRole('button', { name: 'Discard changes' })).toBeDisabled()
  band = { ...band, name: 'Zebra' }
  await act(async () => pending.resolve(json({ band })))
  await waitFor(() => expect(router.state.location.pathname).toBe('/bands/3'))
})

it('cancels old detail/list responses before applying confirmed names', async () => {
  const { client } = mount(); await enter()
  const staleDetail = deferred(), staleList = deferred()
  detailRead = () => staleDetail.promise; listRead = () => staleList.promise
  let reads
  act(() => { reads = Promise.all([client.invalidateQueries({ queryKey: bandKeys.detail(2) }), client.invalidateQueries({ queryKey: bandKeys.list })]) })
  patch = (body) => {
    band = { ...band, name: body.name }; detailRead = () => json({ band }); listRead = () => json({ bands: [band, other] })
    return json({ band })
  }
  await save(); await screen.findByText('Band name saved.')
  await act(async () => {
    staleDetail.resolve(json({ band: { ...band, name: 'Old' } })); staleList.resolve(json({ bands: [{ ...band, name: 'Old' }] })); await reads
  })
  expect(client.getQueryData(bandKeys.detail(2)).name).toBe('Zebra')
  expect(client.getQueryData(bandKeys.list).find((item) => item.bandId === 2).name).toBe('Zebra')
})

it('maps backend name and form validation without losing input', async () => {
  patch = () => failure('VALIDATION_ERROR', 400, [{ field: 'name', message: 'Rejected name.' }, { field: 'other', message: 'Please check the request.' }])
  mount(); await enter(); await save()
  expect(await screen.findByText('Rejected name.')).toBeInTheDocument()
  expect(screen.getByText('Please check the request.')).toBeInTheDocument()
  expect(screen.getByLabelText('Band name')).toHaveValue('Zebra')
  expect(screen.getByLabelText('Band name')).toHaveAttribute('aria-describedby', 'band-name-error')
  expect(writes()).toHaveLength(1)
})

it.each(['network', 'malformed', 'server'])('reconciles an uncertain %s save without replay and acknowledges a matching server name', async (mode) => {
  patch = (body) => {
    band = { ...band, name: body.name }
    if (mode === 'network') throw new TypeError('Offline')
    return mode === 'malformed' ? json({ band: { ...band, bandId: 99 } }) : failure('INTERNAL_ERROR', 500)
  }
  mount(); await enter(' Zebra '); await save()
  expect(await screen.findByText('The current band name matches your change.')).toBeInTheDocument()
  expect(screen.queryByText('Band name saved.')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Band name')).toHaveValue('Zebra')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  expect(writes()).toHaveLength(1)
})

it('locks failed reconciliation until Check again and preserves a conflicting draft for deliberate retry', async () => {
  patch = () => { detailRead = () => failure('INTERNAL_ERROR', 503); return failure('INTERNAL_ERROR', 500) }
  mount(); await enter(); await save()
  await screen.findByRole('button', { name: 'Check again' })
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  expect(screen.getByLabelText('Band name')).toHaveValue('Zebra')
  band = { ...band, name: 'Changed elsewhere' }; detailRead = () => json({ band })
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
  expect(await screen.findByText(/current server name is “Changed elsewhere”/)).toBeInTheDocument()
  expect(screen.getByLabelText('Band name')).toHaveValue('Zebra')
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  expect(writes()).toHaveLength(1)
  patch = (body) => { band = { ...band, name: body.name }; return json({ band }) }
  await save(); await screen.findByText('Band name saved.')
  expect(writes()).toHaveLength(2)
})

it('suppresses denied controls across failed checks, background refresh, and revisits until permission Retry succeeds', async () => {
  patch = () => { detailRead = () => failure('INTERNAL_ERROR', 503); return failure('LEADER_REQUIRED', 403) }
  const { client, router } = mount(); await enter(); await save()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry permissions' })).toBeEnabled())
  expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  detailRead = () => json({ band })
  await act(() => client.invalidateQueries({ queryKey: bandKeys.detail(2) }))
  expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument()
  await act(() => router.navigate('/bands/2'))
  await act(() => router.navigate('/bands/2/settings'))
  expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Retry permissions' }))
  expect(await screen.findByLabelText('Band name')).toHaveValue('Alpha')
})

it.each(['mutation', 'refresh'])('redirects confirmed role revocation during %s without a dirty warning', async (mode) => {
  const { client, router } = mount(); await enter()
  band = { ...band, currentUserRole: 'member' }
  if (mode === 'mutation') { patch = () => failure('LEADER_REQUIRED', 403); await save() }
  else await act(() => client.invalidateQueries({ queryKey: bandKeys.detail(2) }))
  await screen.findByText('Only band leaders can access Settings.')
  expect(router.state.location.pathname).toBe('/bands/2')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument()
})

it('clears inaccessible band context and associated resources after rename failure', async () => {
  patch = () => failure('BAND_NOT_FOUND', 404)
  const { client } = mount(); await enter()
  client.setQueryData([...bandKeys.detail(2), 'events'], ['private event'])
  listRead = () => json({ bands: [other] })
  await save(); await screen.findByText('This band is no longer available')
  expect(client.getQueryData([...bandKeys.detail(2), 'events'])).toBeUndefined()
  expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Go home' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('expires sessions during save, clears private state, and retains a safe Settings destination', async () => {
  patch = () => failure('AUTHENTICATION_REQUIRED', 401)
  const { client, router } = mount(); await enter(); await save()
  await screen.findByRole('heading', { name: 'Login' })
  expect(router.state.location.state.destination).toBe('/bands/2/settings')
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does not repopulate a logged-out session from a late save', async () => {
  const pending = deferred(); patch = () => pending.promise
  const { client } = mount(); await enter(); await save()
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Login' })
  await act(async () => pending.resolve(json({ band: { ...band, name: 'Zebra' } })))
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})


it('honors rate-limit deadlines without automatic retry or reconciliation', async () => {
  patch = () => failure('TOO_MANY_ATTEMPTS', 429, undefined, { 'Retry-After': '60' })
  mount(); await enter(); await save()
  await screen.findByText(/Too many attempts/)
  await save()
  expect(writes()).toHaveLength(1)
  expect(screen.getByLabelText('Band name')).toHaveValue('Zebra')
  expect(screen.queryByText('Checking the band name…')).not.toBeInTheDocument()
})

it('keeps Settings suppressed when the detail check succeeds but the list check fails', async () => {
  patch = () => { listRead = () => failure('INTERNAL_ERROR', 503); return failure('LEADER_REQUIRED', 403) }
  const { router } = mount(); await enter(); await save()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry permissions' })).toBeEnabled())
  expect(screen.queryByLabelText('Band name')).not.toBeInTheDocument()
  await act(() => router.navigate('/bands/2/members'))
  expect(await screen.findByRole('heading', { name: 'Members' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
})
