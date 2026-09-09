// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
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
const band = (bandId, name, currentUserRole = 'member') => ({ bandId, name, currentUserRole,
  isActive: true, createdAt: 'opaque', members: [] })
const json = (data) => new Response(JSON.stringify({ data }), { status: 200 })
const failure = (code, status) => new Response(JSON.stringify({ error: { code, message: 'Failed' } }), { status })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const fetchMock = vi.fn()
let list, details, clients
function mount(entry = '/') {
  const client = createBandosQueryClient()
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } })
  clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}
function count(path) { return fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === `/api/v1${path}`).length }
async function tabReturn() { await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) }) }
beforeEach(() => {
  clients = []; list = []; details = {}
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return json({ bands: list })
    if (path === '/auth/logout' || path === '/auth/login') return json({ message: 'OK' })
    if (path.startsWith('/bands/')) return details[path] instanceof Response ? details[path].clone() : json({ band: details[path] })
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); focusManager.setFocused(undefined); vi.unstubAllGlobals() })

it('distinguishes loading from zero bands and keeps Logout available', async () => {
  const pending = deferred()
  fetchMock.mockImplementationOnce(async () => json({ user })).mockImplementationOnce(() => pending.promise)
  mount()
  await screen.findByRole('button', { name: 'Log out' })
  expect(screen.queryByText(/Share your username/)).not.toBeInTheDocument()
  await act(async () => pending.resolve(json({ bands: [] })))
  expect(await screen.findByText(/Share your username, @alex/)).toBeInTheDocument()
  expect(screen.getByText('You don’t belong to any bands yet.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Create|Members|Settings|Account/ })).not.toBeInTheDocument()
})

it('sorts names case-insensitively with ID ties and distinct duplicate destinations', async () => {
  list = [band(7, 'Zulu'), band(9, 'alpha'), band(2, 'Alpha'), band(3, 'Alpha')]
  mount()
  await screen.findByText(/Share your username/)
  const links = within(screen.getByRole('main')).getAllByRole('link')
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/bands/2', '/bands/3', '/bands/9', '/bands/7'])
  expect(list.map((item) => item.bandId)).toEqual([7, 9, 2, 3])
})

it.each(['leader', 'member'])('uses detail authority for a direct %s workspace and switches to Schedule', async (role) => {
  list = [band(2, 'First', role === 'leader' ? 'member' : 'leader'), band(3, 'Second')]
  details = { '/bands/2': band(2, 'First', role), '/bands/3': band(3, 'Second') }
  const { router } = mount('/bands/2')
  await screen.findByRole('heading', { name: 'First' })
  expect(screen.getByText(role === 'leader' ? 'Leader' : 'Member')).toBeInTheDocument()
  expect(screen.getByText('Schedules are not available yet.')).toBeInTheDocument()
  await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Second' }))
  await screen.findByRole('heading', { name: 'Second' })
  expect(router.state.location.pathname).toBe('/bands/3')
  await act(() => router.navigate(-1))
  await screen.findByRole('heading', { name: 'First' })
  await act(() => router.navigate(1))
  await screen.findByRole('heading', { name: 'Second' })
})

it('supports Menu opening, Escape focus return, and destination focus after navigation', async () => {
  list = [band(2, 'First')]; details['/bands/2'] = list[0]
  const { router } = mount()
  const menu = await screen.findByRole('button', { name: 'Menu' })
  await userEvent.click(menu)
  expect(menu).toHaveAttribute('aria-expanded', 'true')
  await waitFor(() => expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Home' })).toHaveFocus())
  await userEvent.keyboard('{Escape}')
  expect(menu).toHaveFocus()
  expect(menu).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(menu)
  await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'First' }))
  await screen.findByRole('heading', { name: 'First' })
  expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('main')).toHaveFocus()
  await act(() => router.navigate(-1))
  expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
})

it('refreshes list and active detail on tab return without repeating session bootstrap', async () => {
  list = [band(2, 'First')]; details['/bands/2'] = list[0]
  mount('/bands/2')
  await screen.findByRole('heading', { name: 'First' })
  list = [band(2, 'Renamed')]; details['/bands/2'] = list[0]
  await tabReturn()
  await screen.findByRole('heading', { name: 'Renamed' })
  expect(count('/users/me')).toBe(1)
  expect(count('/bands')).toBe(2)
  expect(count('/bands/2')).toBe(2)
})

it.each(['VALIDATION_ERROR', 'TOO_MANY_ATTEMPTS'])('does not retry %s list failures and offers contextual Retry', async (code) => {
  fetchMock.mockImplementationOnce(async () => json({ user })).mockImplementationOnce(async () => failure(code, 400))
  mount()
  await screen.findAllByText('We couldn’t load your bands.')
  expect(screen.queryByText(/Share your username/)).not.toBeInTheDocument()
  expect(count('/bands')).toBe(1)
  await userEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Retry' }))
  await screen.findByText(/Share your username/)
})

it('bounds transient retries and retains useful data on failed background refresh', async () => {
  list = [band(2, 'First')]; details['/bands/2'] = list[0]
  mount('/bands/2')
  await screen.findByRole('heading', { name: 'First' })
  details['/bands/2'] = failure('INTERNAL_ERROR', 503)
  await tabReturn()
  await screen.findByText('We couldn’t update this band.')
  expect(count('/bands/2')).toBe(3)
  expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument()
  details['/bands/2'] = band(2, 'Recovered')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('heading', { name: 'Recovered' })
})

it.each(['0', '01', '-1', '1.2', '9007199254740992', 'new'])('does not request malformed band ID %s', async (id) => {
  mount(`/bands/${id}`)
  await screen.findByRole('heading', { name: 'Invalid band address' })
  expect(count(`/bands/${id}`)).toBe(0)
  expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
})

it.each([
  { currentUserRole: 'owner' }, { bandId: 3 }, { members: null },
  { members: [{ userId: 1, username: 'a', firstName: 'A', lastName: 'B', role: 'owner' }] },
])('rejects malformed detail without granting workspace context: %j', async (invalid) => {
  details['/bands/2'] = { ...band(2, 'Secret', 'leader'), ...invalid }
  mount('/bands/2')
  await screen.findByText('We couldn’t load this band.')
  expect(screen.queryByRole('heading', { name: 'Secret' })).not.toBeInTheDocument()
  expect(screen.queryByText('Leader')).not.toBeInTheDocument()
})

it('rejects malformed list shapes instead of showing zero bands', async () => {
  list = [band(2, 'First'), band(2, 'Duplicate ID')]
  mount()
  await screen.findAllByText('We couldn’t load your bands.')
  expect(screen.queryByText(/Share your username/)).not.toBeInTheDocument()
})

it('clears revoked context and band resources and prevents an older list from restoring the band', async () => {
  list = [band(2, 'Secret', 'leader')]; details['/bands/2'] = list[0]
  const { client } = mount('/bands/2')
  await screen.findByRole('heading', { name: 'Secret' })
  client.setQueryData([...bandKeys.detail(2), 'events'], ['private event'])
  const oldList = deferred()
  const original = fetchMock.getMockImplementation()
  let hold = true
  fetchMock.mockImplementation((url, options) => {
    if (new URL(url).pathname.endsWith('/bands') && hold) { hold = false; return oldList.promise }
    return original(url, options)
  })
  list = []; details['/bands/2'] = failure('BAND_NOT_FOUND', 404)
  await tabReturn()
  await screen.findByRole('heading', { name: 'This band is no longer available' })
  await act(async () => oldList.resolve(json({ bands: [band(2, 'Secret', 'leader')] })))
  expect(screen.queryByText('Leader')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Secret' })).not.toBeInTheDocument()
  expect(client.getQueryData([...bandKeys.detail(2), 'events'])).toBeUndefined()
  expect(client.getQueryData(bandKeys.detail(2))).toBeNull()
  expect(count('/bands/2')).toBe(2)
})

it('does not show an old band response after switching destinations', async () => {
  list = [band(2, 'Old'), band(3, 'Current')]; details['/bands/3'] = list[1]
  const pending = deferred(); const original = fetchMock.getMockImplementation()
  fetchMock.mockImplementation((url, options) => new URL(url).pathname.endsWith('/bands/2') ? pending.promise : original(url, options))
  mount('/bands/2')
  await screen.findByRole('link', { name: 'Current' })
  await userEvent.click(screen.getByRole('link', { name: 'Current' }))
  await screen.findByRole('heading', { name: 'Current' })
  await act(async () => pending.resolve(json({ band: list[0] })))
  expect(screen.queryByRole('heading', { name: 'Old' })).not.toBeInTheDocument()
})

it('expires during band reads, discards late private results, and restores the direct URL after Login', async () => {
  const pending = deferred(); const original = fetchMock.getMockImplementation()
  let expire = true
  fetchMock.mockImplementation((url, options) => {
    const path = new URL(url).pathname
    if (expire && path.endsWith('/bands')) return pending.promise
    if (expire && path.endsWith('/bands/2')) return Promise.resolve(failure('AUTHENTICATION_REQUIRED', 401))
    return original(url, options)
  })
  const { client, router } = mount('/bands/2?view=day#today')
  await screen.findByRole('heading', { name: 'Login' })
  await act(async () => pending.resolve(json({ bands: [band(2, 'Old private')] })))
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expire = false; list = [band(2, 'Restored')]; details['/bands/2'] = list[0]
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  await screen.findByRole('heading', { name: 'Restored' })
  expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe('/bands/2?view=day#today')
  expect(screen.queryByText('Old private')).not.toBeInTheDocument()
})
