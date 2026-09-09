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
import { resolveCreationOrigin, resolveDestination } from '../app/destination.js'

const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true, created_at: 'opaque' }
const band = (bandId, name = 'New band') => ({ bandId, name, currentUserRole: 'leader',
  isActive: true, createdAt: 'opaque', members: [
    { userId: 17, username: 'alex', firstName: 'Alex', lastName: 'Rivera', role: 'leader' },
  ] })
const json = (data, status = 200) => new Response(JSON.stringify({ data }), { status })
const failure = (code, status = 400, details, headers) => new Response(JSON.stringify({ error: { code, message: 'Failed', details } }), { status, headers })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const fetchMock = vi.fn()
let list, post, clients, listRead
function mount(entries = ['/bands/new']) {
  const client = createBandosQueryClient()
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } })
  clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: entries, initialIndex: entries.length - 1 })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}
const posts = () => fetchMock.mock.calls.filter(([, options]) => options.method === 'POST' && !options.body?.includes('password'))
async function enter(name = 'New band') {
  fireEvent.change(await screen.findByLabelText('Band name'), { target: { value: name } })
}
async function submit() { await userEvent.click(screen.getByRole('button', { name: 'Create band', exact: true })) }
beforeEach(() => {
  clients = []; list = []; listRead = () => json({ bands: list })
  post = () => { const created = band(9); list = [...list, created]; return json({ band: created }, 201) }
  fetchMock.mockReset().mockImplementation(async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return options.method === 'POST' ? post() : listRead()
    if (path.startsWith('/bands/')) return json({ band: list.find((item) => path === `/bands/${item.bandId}`) })
    if (path.startsWith('/auth/')) return json({ message: 'OK' })
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([{ existing: [] }, { existing: [band(2, 'Existing')] }])('exposes creation in home and global navigation with bands %j', async ({ existing }) => {
  list = existing
  const { router } = mount(['/'])
  await screen.findByRole('heading', { name: 'Bandos' })
  const home = within(screen.getByRole('main'))
  await userEvent.click(await home.findByRole('link', { name: 'Create a band' }))
  await screen.findByLabelText('Band name')
  expect(router.state.location.state.creationOrigin).toBe('/')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  const nav = within(screen.getByRole('navigation', { name: 'Primary' }))
  await userEvent.click(nav.getByRole('link', { name: 'Create a band' }))
  await screen.findByLabelText('Band name')
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/bands/new'))).toBe(false)
})

it('validates on blur/edit and submit using trimmed JS length; accepts 50 characters', async () => {
  mount()
  const input = await screen.findByLabelText('Band name')
  expect(input).toHaveAttribute('aria-invalid', 'false')
  fireEvent.blur(input)
  expect(await screen.findByText('Enter a band name.')).toBeInTheDocument()
  await enter('😀'.repeat(25) + 'a')
  expect(screen.getByText('Use 50 characters or fewer.')).toBeInTheDocument()
  await submit()
  expect(input).toHaveFocus()
  expect(posts()).toHaveLength(0)
  await enter('   ')
  await submit()
  expect(posts()).toHaveLength(0)
  await enter('  ' + '😀'.repeat(25) + '  ')
  await submit()
  await screen.findByRole('heading', { name: 'Members' })
  expect(JSON.parse(posts()[0][1].body)).toEqual({ name: '😀'.repeat(25) })
})

it('submits once while pending, caches confirmed Leader, replaces history and consumes intent', async () => {
  const pending = deferred(); post = () => pending.promise
  const { router, client } = mount(['/', '/bands/new'])
  const locations = []
  router.subscribe((state) => locations.push(state.location))
  await enter('  New band  ')
  await submit()
  fireEvent.submit(screen.getByLabelText('Band name').closest('form'))
  expect(screen.getByRole('button', { name: 'Creating band…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(posts()).toHaveLength(1)
  expect(posts()[0][1].credentials).toBe('include')
  list = [band(9)]
  await act(async () => pending.resolve(json({ band: list[0] }, 201)))
  await screen.findByRole('heading', { name: 'Members' })
  expect(screen.getByText('@alex')).toBeInTheDocument()
  expect(client.getQueryData(bandKeys.detail(9))).toEqual(band(9))
  expect(client.getQueryData(bandKeys.list)[0].bandId).toBe(9)
  expect(locations.some((location) => location.state?.openAddMember === true)).toBe(true)
  await waitFor(() => expect(router.state.location.state?.openAddMember).toBeUndefined())
  expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
  await act(() => router.navigate(-1))
  expect(router.state.location.pathname).toBe('/')
})

it.each([undefined, '//evil.example', '/login', '/bands/new', '/bands/9007199254740992', '/bands/01'])('safely cancels unsafe/missing origin %s to home', async (origin) => {
  const { router } = mount([{ pathname: '/bands/new', state: { creationOrigin: origin } }])
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  expect(router.state.location.pathname).toBe('/')
})

it('returns Cancel to a validated origin including search and hash; restores focus when keeping edits', async () => {
  list = [band(2, 'Existing')]
  const origin = '/bands/2/members?view=all#people'
  const { router } = mount([origin])
  await userEvent.click(await screen.findByRole('link', { name: 'Create a band' }))
  await enter()
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  await userEvent.click(cancel)
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(cancel).toHaveFocus()
  expect(screen.getByLabelText('Band name')).toHaveValue('New band')
  await userEvent.click(cancel)
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes', exact: true }))
  expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe(origin)
})

it('guards Back and Forward and SPA links, and unload only while input differs from baseline', async () => {
  const { router } = mount(['/', '/bands/new', '/'])
  await screen.findByRole('heading', { name: 'Bandos' })
  await act(() => router.navigate(-1))
  await enter()
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  for (const direction of [-1, 1]) {
    await act(() => router.navigate(direction))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/bands/new')
  }
  await userEvent.click(screen.getByRole('link', { name: 'Home' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(router.state.location.pathname).toBe('/bands/new')
  await enter('')
  const cleanUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(cleanUnload)
  expect(cleanUnload.defaultPrevented).toBe(false)
  await act(() => router.navigate(1))
  expect(router.state.location.pathname).toBe('/')
})

it('maps server field and unrecognized errors without reconciling or retrying', async () => {
  post = () => failure('VALIDATION_ERROR', 400, [{ field: 'name', message: 'Server name error.' }, { field: 'other', message: 'Form error.' }])
  mount(); await enter(); await submit()
  expect(await screen.findByText('Server name error.')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Form error.')
  expect(screen.getByLabelText('Band name')).toHaveAttribute('aria-describedby', expect.stringContaining('band-name-error'))
  expect(posts()).toHaveLength(1)
  expect(screen.queryByText(/Checking your bands/)).not.toBeInTheDocument()
})

it('honors rate-limit deadlines without automatic retry', async () => {
  post = () => failure('TOO_MANY_ATTEMPTS', 429, undefined, { 'Retry-After': '3600' })
  mount(); await enter(); await submit()
  await screen.findByText(/Too many attempts. Try again after/)
  await submit()
  expect(posts()).toHaveLength(1)
  expect(screen.getByLabelText('Band name')).toHaveValue('New band')
})

it.each(['network', 'server', 'malformed', 'wrong-status', 'not-leader'])('checks uncertain %s creation without guessing among duplicate names', async (kind) => {
  list = [band(2)]
  post = () => {
    list = [band(2), band(9)]
    if (kind === 'network') throw new TypeError('Connection lost')
    if (kind === 'server') return failure('INTERNAL_ERROR', 500)
    if (kind === 'wrong-status') return json({ band: band(9) })
    if (kind === 'not-leader') return json({ band: { ...band(9), members: [] } }, 201)
    return json({ band: {} }, 201)
  }
  const { router } = mount(); await enter(); await submit()
  const again = await screen.findByRole('button', { name: 'Create again' })
  expect(router.state.location.pathname).toBe('/bands/new')
  expect(posts()).toHaveLength(1)
  const links = within(screen.getByRole('region', { name: 'Check existing bands' })).getAllByRole('link')
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/bands/2', '/bands/9'])
  expect(screen.getByText(/could create another band/)).toBeInTheDocument()
  expect(screen.getByLabelText('Band name')).toHaveValue('New band')
  post = () => json({ band: band(9) }, 201)
  await userEvent.click(again)
  await screen.findByRole('heading', { name: 'Members' })
  expect(posts()).toHaveLength(2)
})

it('blocks resubmission through failed checks until an explicit fresh check succeeds', async () => {
  const check = deferred()
  post = () => { listRead = () => check.promise; return failure('INTERNAL_ERROR', 500) }
  mount(); await enter(); await submit()
  await screen.findByText('Checking your bands…')
  fireEvent.submit(screen.getByLabelText('Band name').closest('form'))
  await act(async () => check.resolve(failure('INTERNAL_ERROR', 503)))
  const retry = await screen.findByRole('button', { name: 'Check again' })
  expect(screen.getByRole('button', { name: 'Create band', exact: true })).toBeDisabled()
  fireEvent.submit(screen.getByLabelText('Band name').closest('form'))
  expect(posts()).toHaveLength(1)
  listRead = () => json({ bands: [] })
  await userEvent.click(retry)
  expect(await screen.findByRole('button', { name: 'Create again' })).toBeEnabled()
  expect(posts()).toHaveLength(1)
})

it('cancels an older list read so it cannot erase confirmed creation', async () => {
  const old = deferred(); let calls = 0
  listRead = () => ++calls === 1 ? old.promise : json({ bands: list })
  const { client } = mount(); await enter(); await submit()
  await screen.findByRole('heading', { name: 'Members' })
  await act(async () => old.resolve(json({ bands: [] })))
  expect(client.getQueryData(bandKeys.list).map((item) => item.bandId)).toEqual([9])
})

it('keeps confirmed success when list revalidation fails', async () => {
  post = () => { list = [band(9)]; listRead = () => failure('INTERNAL_ERROR', 503); return json({ band: band(9) }, 201) }
  mount(); await enter(); await submit()
  await screen.findByRole('heading', { name: 'Members' })
  await screen.findByText('We couldn’t update your bands.')
  expect(screen.getByRole('link', { name: 'New band' })).toBeInTheDocument()
  expect(screen.queryByText(/couldn’t confirm/)).not.toBeInTheDocument()
  expect(posts()).toHaveLength(1)
})

it('expires without a dirty prompt and restores creation without replay', async () => {
  post = () => failure('AUTHENTICATION_REQUIRED', 401)
  const { router, client } = mount(); await enter(); await submit()
  await screen.findByRole('heading', { name: 'Login' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(router.state.location.state.destination).toBe('/bands/new')
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  expect(await screen.findByLabelText('Band name')).toHaveValue('')
  expect(posts()).toHaveLength(1)
})

it('does not cache or navigate late creation after Logout', async () => {
  const pending = deferred(); post = () => pending.promise
  const { client, router } = mount(); await enter(); await submit()
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Login' })
  await act(async () => pending.resolve(json({ band: band(9) }, 201)))
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(router.state.location.pathname).toBe('/login')
})

it('recognizes static creation destinations and safely validates its separate origin', () => {
  expect(resolveDestination('/bands/new?x=1#name')).toBe('/bands/new?x=1#name')
  expect(resolveCreationOrigin('/bands/2/members?x=1#people')).toBe('/bands/2/members?x=1#people')
  for (const origin of ['https://evil.example', '/\\evil.example', '/bands/new', '/bands/%ZZ', '/bands/2/events/new']) {
    expect(resolveCreationOrigin(origin)).toBe('/')
  }
})


it.each(['validation', 'success'])('holds attempted navigation during a pending write until %s resolves', async (outcome) => {
  const pending = deferred(); post = () => pending.promise
  const { router } = mount(); await enter(); await submit()
  await userEvent.click(screen.getByRole('link', { name: 'Home' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  expect(screen.getByText(/Please wait for the result before leaving/)).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/bands/new')
  list = [band(9)]
  await act(async () => pending.resolve(outcome === 'success' ? json({ band: band(9) }, 201)
    : failure('VALIDATION_ERROR', 400, [{ field: 'name', message: 'Choose a name.' }])))
  if (outcome === 'success') {
    await screen.findByRole('heading', { name: 'Members' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  } else {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(router.state.location.pathname).toBe('/')
  }
})

it('keeps the mobile menu open when Escape cancels its dirty-navigation dialog', async () => {
  mount(); await enter()
  const menu = screen.getByRole('button', { name: 'Menu' })
  await userEvent.click(menu)
  const home = screen.getByRole('link', { name: 'Home' })
  await userEvent.click(home)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' })
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(menu).toHaveAttribute('aria-expanded', 'true')
  expect(home).toHaveFocus()
})
