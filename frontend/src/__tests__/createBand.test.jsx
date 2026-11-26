// @vitest-environment jsdom
import { sessionFixture } from './fixtures/session.js'
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
  email: 'alex@example.com', plan: 'free', is_active: true, version: 1, email_verified_at: '2026-10-01T00:00:00.000Z', pending_email: null, created_at: 'opaque' }
const starterCatalog = [
  { instrumentId: 1, name: 'Vocals' },
  { instrumentId: 2, name: 'Guitar' },
  { instrumentId: 3, name: 'Bass' },
  { instrumentId: 4, name: 'Drums' },
]
// Band-scoped instrument IDs (101+) are intentionally distinct from starter IDs (1–4).
const band = (bandId, name = 'New band', overrides = {}) => ({
  bandId, name, currentUserRole: 'leader', version: 1,
  instruments: [
    { instrumentId: 101, name: 'Vocals' },
    { instrumentId: 102, name: 'Guitar' },
    { instrumentId: 103, name: 'Bass' },
    { instrumentId: 104, name: 'Drums' },
  ],
  instrumentation: [{ slotId: 501, instrumentId: 102, label: 'Guitar', position: 0 }],
  defaultLineup: null,
  isActive: true, createdAt: 'opaque',
  members: [
    { userId: 17, username: 'alex', firstName: 'Alex', lastName: 'Rivera', role: 'leader', instrumentIds: [] },
  ],
  ...overrides,
})
const json = (data, status = 200) => new Response(JSON.stringify({ data }), { status })
const failure = (code, status = 400, details, headers) => new Response(JSON.stringify({ error: { code, message: 'Failed', details } }), { status, headers })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const fetchMock = vi.fn()
let list, post, clients, listRead, catalogRead
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
async function selectStarter(slotNumber = 1, instrumentId = '2') {
  const select = await screen.findByLabelText(`Slot ${slotNumber} instrument`)
  await waitFor(() => expect(within(select).getByRole('option', { name: 'Guitar' })).toBeInTheDocument())
  fireEvent.change(select, { target: { value: String(instrumentId) } })
}
async function fillValid(name = 'New band', instrumentId = '2') {
  await enter(name)
  await selectStarter(1, instrumentId)
}
async function submit() { await userEvent.click(screen.getByRole('button', { name: 'Create band', exact: true })) }
beforeEach(() => {
  clients = []; list = []; listRead = () => json({ bands: list })
  catalogRead = () => json({ instruments: starterCatalog })
  post = () => { const created = band(9); list = [...list, created]; return json({ band: created }, 201) }
  fetchMock.mockReset().mockImplementation(async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user, session: sessionFixture })
    if (path === '/instruments') return catalogRead(url, options)
    if (path === '/bands') return options.method === 'POST' ? post(options) : listRead()
    if (path.startsWith('/bands/')) return json({ band: list.find((item) => path === `/bands/${item.bandId}`) })
    if (path.startsWith('/auth/')) return json({ user, session: sessionFixture, message: 'OK' })
    throw new Error(`Unexpected request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([{ existing: [] }, { existing: [band(2, 'Existing')] }])('exposes creation from home navigation with bands %j', async ({ existing }) => {
  list = existing
  const { router } = mount(['/'])
  await screen.findByRole('heading', { name: 'Personal datebook' })
  const home = within(screen.getByRole('main'))
  const createLink = existing.length === 0
    ? await home.findByRole('link', { name: 'Create a band' })
    : within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Create a band' })
  await userEvent.click(createLink)
  await screen.findByLabelText('Band name')
  expect(router.state.location.state.creationOrigin).toBe('/')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  const nav = within(screen.getByRole('navigation', { name: 'Primary' }))
  await userEvent.click(nav.getByRole('link', { name: 'Create a band' }))
  await screen.findByLabelText('Band name')
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/bands/new'))).toBe(false)
})

it.each(['/bands/new', '/bands/new/'])('keeps Create a band non-navigating on %s and preserves the Cancel origin', async (pathname) => {
  list = [band(2, 'Existing')]
  const { router } = mount([{ pathname, state: { creationOrigin: '/bands/2' } }])
  await screen.findByLabelText('Band name')
  const navigation = within(screen.getByRole('navigation', { name: 'Primary' }))
  const create = navigation.getByRole('link', { name: 'Create a band' })
  expect(create).toHaveAttribute('aria-current', 'page')
  expect(create).toHaveClass('create-band-action')
  await userEvent.click(create)
  expect(router.state.location.state.creationOrigin).toBe('/bands/2')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await screen.findByRole('heading', { name: 'Existing' })
  expect(router.state.location.pathname).toBe('/bands/2')
})

it('validates on blur/edit and submit using trimmed JS length; accepts 50 characters', async () => {
  mount()
  const input = await screen.findByLabelText('Band name')
  expect(input).toHaveAttribute('aria-invalid', 'false')
  fireEvent.blur(input)
  expect(await screen.findByText('Enter a band name.')).toBeInTheDocument()
  await enter('😀'.repeat(25) + 'a')
  expect(screen.getByText('Use 50 characters or fewer.')).toBeInTheDocument()
  await selectStarter(1, '2')
  await submit()
  expect(input).toHaveFocus()
  expect(posts()).toHaveLength(0)
  await enter('   ')
  await submit()
  expect(posts()).toHaveLength(0)
  await enter('  ' + '😀'.repeat(25) + '  ')
  await submit()
  await screen.findByRole('heading', { name: 'Members' })
  expect(JSON.parse(posts()[0][1].body)).toEqual({
    name: '😀'.repeat(25),
    instrumentation: [{ instrumentId: 2, label: 'Guitar' }],
  })
})

it('creates a band with repeated starter instruments, explicit labels, and caches band-scoped IDs', async () => {
  const created = band(9, 'Twin Guitars', {
    instrumentation: [
      { slotId: 501, instrumentId: 102, label: 'Guitar 1', position: 0 },
      { slotId: 502, instrumentId: 102, label: 'Lead guitar', position: 1 },
    ],
  })
  post = () => { list = [...list, created]; return json({ band: created }, 201) }
  const { client } = mount()
  await enter('  Twin Guitars  ')
  await selectStarter(1, '2')
  expect(screen.getByLabelText('Slot 1 label')).toHaveValue('Guitar')
  await userEvent.click(screen.getByRole('button', { name: 'Add slot' }))
  expect(screen.getByLabelText('Slot 2 instrument')).toHaveFocus()
  await selectStarter(2, '2')
  expect(screen.getByLabelText('Slot 1 label')).toHaveValue('Guitar 1')
  expect(screen.getByLabelText('Slot 2 label')).toHaveValue('Guitar 2')
  fireEvent.change(screen.getByLabelText('Slot 2 label'), { target: { value: '  Lead guitar  ' } })
  await submit()
  await screen.findByRole('heading', { name: 'Members' })
  const sent = JSON.parse(posts()[0][1].body)
  expect(sent).toEqual({
    name: 'Twin Guitars',
    instrumentation: [
      { instrumentId: 2, label: 'Guitar 1' },
      { instrumentId: 2, label: 'Lead guitar' },
    ],
  })
  expect(sent.instrumentation[0]).not.toHaveProperty('clientKey')
  expect(sent.instrumentation[0]).not.toHaveProperty('slotId')
  expect(sent).not.toHaveProperty('leaderInstrumentIds')
  const cached = client.getQueryData(bandKeys.detail(9))
  expect(cached.instruments.find((item) => item.name === 'Guitar').instrumentId).toBe(102)
  expect(cached.instrumentation.map((slot) => slot.instrumentId)).toEqual([102, 102])
})

it('allows custom-only bands with repeated normalized custom names and validates 1–50 bounds', async () => {
  const created = band(11, 'Synth Duo', {
    instruments: [
      ...band(11).instruments,
      { instrumentId: 201, name: 'Synthesizer' },
    ],
    instrumentation: [
      { slotId: 601, instrumentId: 201, label: 'Lead synth', position: 0 },
      { slotId: 602, instrumentId: 201, label: 'Pad synth', position: 1 },
    ],
  })
  post = () => { list = [...list, created]; return json({ band: created }, 201) }
  const { client } = mount()
  await enter('Synth Duo')
  fireEvent.change(await screen.findByLabelText('Slot 1 instrument'), { target: { value: 'custom' } })
  const custom1 = await screen.findByLabelText('Slot 1 custom instrument name')
  expect(custom1).toHaveFocus()
  fireEvent.change(custom1, { target: { value: 'x'.repeat(51) } })
  await submit()
  expect(custom1).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getAllByText('Use 50 characters or fewer.').length).toBeGreaterThanOrEqual(1)
  expect(custom1).toHaveFocus()
  expect(posts()).toHaveLength(0)

  fireEvent.change(custom1, { target: { value: '  Synthesizer  ' } })
  const label1 = screen.getByLabelText('Slot 1 label')
  fireEvent.change(label1, { target: { value: '   ' } })
  await submit()
  expect(screen.getByText('Enter a slot label.')).toBeInTheDocument()
  expect(label1).toHaveFocus()
  expect(posts()).toHaveLength(0)

  fireEvent.change(label1, { target: { value: '  Lead synth  ' } })
  await userEvent.click(screen.getByRole('button', { name: 'Add slot' }))
  fireEvent.change(screen.getByLabelText('Slot 2 instrument'), { target: { value: 'custom' } })
  fireEvent.change(await screen.findByLabelText('Slot 2 custom instrument name'), { target: { value: 'synthesizer' } })
  fireEvent.change(screen.getByLabelText('Slot 2 label'), { target: { value: 'Pad synth' } })
  await submit()
  await screen.findByRole('heading', { name: 'Members' })
  const sent = JSON.parse(posts()[0][1].body)
  expect(sent).toEqual({
    name: 'Synth Duo',
    instrumentation: [
      { instrumentName: 'Synthesizer', label: 'Lead synth' },
      { instrumentName: 'synthesizer', label: 'Pad synth' },
    ],
  })
  expect(sent.instrumentation[0]).not.toHaveProperty('instrumentId')
  expect(sent.instrumentation[1]).not.toHaveProperty('instrumentId')
  const cached = client.getQueryData(bandKeys.detail(11))
  expect(cached.instruments.filter((item) => item.name.toLowerCase() === 'synthesizer')).toHaveLength(1)
  expect(cached.instrumentation.map((slot) => slot.instrumentId)).toEqual([201, 201])
})

it('enforces 1 and 50 slot limits, blocks a 51st row, and restores focus on row removal', async () => {
  mount()
  await screen.findByLabelText('Slot 1 instrument')
  expect(screen.getByRole('button', { name: 'Remove slot 1' })).toBeDisabled()
  const addButton = screen.getByRole('button', { name: 'Add slot' })
  for (let count = 2; count <= 50; count += 1) {
    fireEvent.click(addButton)
  }
  expect(screen.getByLabelText('Slot 50 instrument')).toBeInTheDocument()
  expect(addButton).toBeDisabled()
  expect(screen.getByText('Maximum of 50 instrument slots reached.')).toBeInTheDocument()
  fireEvent.click(addButton)
  expect(screen.queryByLabelText('Slot 51 instrument')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Remove slot 50' }))
  expect(screen.queryByLabelText('Slot 50 instrument')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Slot 49 instrument')).toHaveFocus()
  expect(addButton).toBeEnabled()
})

it('sends optional starter-only leaderInstrumentIds and requires no musician assignment', async () => {
  const created = band(12, 'Quartet', {
    members: [
      { userId: 17, username: 'alex', firstName: 'Alex', lastName: 'Rivera', role: 'leader', instrumentIds: [101, 103] },
    ],
  })
  post = () => { list = [...list, created]; return json({ band: created }, 201) }
  const { client } = mount()
  await fillValid('Quartet', '2')
  const leaderGroup = screen.getByRole('group', { name: 'Your instruments (optional)' })
  expect(within(leaderGroup).getByText(/custom instrument eligibility can be edited later in Members/i)).toBeInTheDocument()
  await userEvent.click(within(leaderGroup).getByLabelText('Bass'))
  await userEvent.click(within(leaderGroup).getByLabelText('Vocals'))
  await submit()
  await screen.findByRole('heading', { name: 'Members' })
  expect(JSON.parse(posts()[0][1].body)).toEqual({
    name: 'Quartet',
    instrumentation: [{ instrumentId: 2, label: 'Guitar' }],
    leaderInstrumentIds: [1, 3],
  })
  expect(client.getQueryData(bandKeys.detail(12)).members[0].instrumentIds).toEqual([101, 103])
})

it('recovers starter catalog load failure with Retry and still allows custom-only creation', async () => {
  let failCatalog = true
  catalogRead = () => failCatalog ? failure('INTERNAL_ERROR', 503) : json({ instruments: starterCatalog })
  mount()
  expect(await screen.findByText(/couldn’t load starter instruments/i)).toBeInTheDocument()
  failCatalog = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry starter instruments' }))
  await waitFor(() => expect(within(screen.getByLabelText('Slot 1 instrument')).getByRole('option', { name: 'Guitar' })).toBeInTheDocument())
  const instrumentCalls = fetchMock.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/instruments'))
  expect(instrumentCalls.at(-1)[1].headers.get('X-bandos-activity')).toBe('user')
})

it('submits once while pending, caches confirmed Leader, replaces history and consumes intent', async () => {
  const pending = deferred(); post = () => pending.promise
  const { router, client } = mount(['/', '/bands/new'])
  const locations = []
  router.subscribe((state) => locations.push(state.location))
  await fillValid('  New band  ')
  await submit()
  fireEvent.submit(screen.getByLabelText('Band name').closest('form'))
  expect(screen.getByRole('button', { name: 'Creating band…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add slot' })).toBeDisabled()
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
  expect(screen.getByLabelText('Add band member or user')).toHaveValue('')
  await act(() => router.navigate(-1))
  expect(router.state.location.pathname).toBe('/')
})

it.each([undefined, '//evil.example', '/login', '/bands/new', '/bands/9007199254740992', '/bands/01'])('safely cancels unsafe/missing origin %s to home', async (origin) => {
  const { router } = mount([{ pathname: '/bands/new', state: { creationOrigin: origin } }])
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  expect(router.state.location.pathname).toBe('/')
  expect(posts()).toHaveLength(0)
})

it('returns Cancel to a validated origin including search and hash; restores focus when keeping edits with no writes', async () => {
  list = [band(2, 'Existing')]
  const origin = '/bands/2/members?view=all#people'
  const { router } = mount([origin])
  await userEvent.click(await screen.findByRole('link', { name: 'Create a band' }))
  await fillValid()
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
  expect(posts()).toHaveLength(0)
})

it('guards Back and Forward and SPA links, and unload only while input differs from baseline', async () => {
  const { router } = mount(['/', '/bands/new', '/'])
  await screen.findByRole('heading', { name: 'Personal datebook' })
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
  await userEvent.click(screen.getByRole('link', { name: 'Datebook' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(router.state.location.pathname).toBe('/bands/new')
  await enter('')
  const cleanUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(cleanUnload)
  expect(cleanUnload.defaultPrevented).toBe(false)
  await act(() => router.navigate(1))
  expect(router.state.location.pathname).toBe('/')
})

it('maps server field, slot, leader and unrecognized errors without reconciling or retrying', async () => {
  post = () => failure('VALIDATION_ERROR', 400, [
    { field: 'name', message: 'Server name error.' },
    { field: 'instrumentation.0.label', message: 'Slot label invalid.' },
    { field: 'leaderInstrumentIds.0', message: 'Unknown starter instrument.' },
    { field: 'other', message: 'Form error.' },
  ])
  mount(); await fillValid(); await submit()
  expect(await screen.findByText('Server name error.')).toBeInTheDocument()
  expect(screen.getByText('Slot label invalid.')).toBeInTheDocument()
  expect(screen.getByText('Unknown starter instrument.')).toHaveAttribute('role', 'alert')
  expect(screen.getByText('Form error.')).toHaveAttribute('role', 'alert')
  expect(screen.getByLabelText('Band name')).toHaveAttribute('aria-describedby', expect.stringContaining('band-name-error'))
  expect(screen.getByLabelText('Slot 1 label')).toHaveAttribute('aria-invalid', 'true')
  expect(posts()).toHaveLength(1)
  expect(screen.queryByText(/Checking your bands/)).not.toBeInTheDocument()
})

it('honors rate-limit deadlines without automatic retry', async () => {
  post = () => failure('TOO_MANY_ATTEMPTS', 429, undefined, { 'Retry-After': '3600' })
  mount(); await fillValid(); await submit()
  await screen.findByText(/Too many attempts. Try again after/)
  await submit()
  expect(posts()).toHaveLength(1)
  expect(screen.getByLabelText('Band name')).toHaveValue('New band')
})

it.each(['network', 'server', 'malformed', 'wrong-status', 'not-leader'])('recovers uncertain %s creation with the same intent, without guessing by name', async (kind) => {
  list = [band(2)]
  post = () => {
    list = [band(2), band(9)]
    if (kind === 'network') throw new TypeError('Connection lost')
    if (kind === 'server') return failure('INTERNAL_ERROR', 500)
    if (kind === 'wrong-status') return json({ band: band(9) })
    if (kind === 'not-leader') return json({ band: { ...band(9), members: [] } }, 201)
    return json({ band: {} }, 201)
  }
  const { router } = mount(); await fillValid(); await submit()
  const again = await screen.findByRole('button', { name: 'Retry same request' })
  expect(router.state.location.pathname).toBe('/bands/new')
  expect(posts()).toHaveLength(1)
  expect(screen.getByLabelText('Band name')).toHaveValue('New band')
  expect(screen.getByLabelText('Band name')).toBeDisabled()
  expect(screen.getByLabelText('Slot 1 instrument')).toBeDisabled()
  fireEvent.submit(screen.getByLabelText('Band name').closest('form'))
  expect(posts()).toHaveLength(1)
  post = () => json({ band: band(9) }, 201)
  await userEvent.click(again)
  await screen.findByRole('heading', { name: 'Members' })
  expect(posts()).toHaveLength(2)
  expect(posts()[1][1].body).toBe(posts()[0][1].body)
  expect(posts()[1][1].headers.get('Idempotency-Key')).toBe(posts()[0][1].headers.get('Idempotency-Key'))
})

it('cancels an older list read so it cannot erase confirmed creation', async () => {
  const old = deferred(); let calls = 0
  listRead = () => ++calls === 1 ? old.promise : json({ bands: list })
  const { client } = mount(); await fillValid(); await submit()
  await screen.findByRole('heading', { name: 'Members' })
  await act(async () => old.resolve(json({ bands: [] })))
  expect(client.getQueryData(bandKeys.list).map((item) => item.bandId)).toEqual([9])
})

it('keeps confirmed success when list revalidation fails', async () => {
  post = () => { list = [band(9)]; listRead = () => failure('INTERNAL_ERROR', 503); return json({ band: band(9) }, 201) }
  mount(); await fillValid(); await submit()
  await screen.findByRole('heading', { name: 'Members' })
  await screen.findByText('We couldn’t update your bands.')
  expect(screen.getByRole('link', { name: 'New band' })).toBeInTheDocument()
  expect(screen.queryByText(/couldn’t confirm/)).not.toBeInTheDocument()
  expect(posts()).toHaveLength(1)
})

it('expires without a dirty prompt and restores creation without replay', async () => {
  post = () => failure('AUTHENTICATION_REQUIRED', 401)
  const { router, client } = mount(); await fillValid(); await submit()
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
  const { client, router } = mount(); await fillValid(); await submit()
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Login' })
  await act(async () => pending.resolve(json({ band: band(9) }, 201)))
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(router.state.location.pathname).toBe('/login')
})

it('recognizes static creation destinations and safely validates its separate origin', () => {
  expect(resolveDestination('/bands/new?x=1#name')).toBe('/bands/new#name')
  expect(resolveCreationOrigin('/bands/2/members?x=1#people')).toBe('/bands/2/members#people')
  for (const origin of ['https://evil.example', '/\\evil.example', '/bands/new', '/bands/%ZZ', '/bands/2/events/new']) {
    expect(resolveCreationOrigin(origin)).toBe('/')
  }
})

it.each(['validation', 'success'])('holds attempted navigation during a pending write until %s resolves', async (outcome) => {
  const pending = deferred(); post = () => pending.promise
  const { router } = mount(); await fillValid(); await submit()
  await userEvent.click(screen.getByRole('link', { name: 'Datebook' }))
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

it('keeps the drawer dismissed when Escape cancels its dirty-navigation dialog', async () => {
  vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  mount(); await enter()
  const menu = screen.getByRole('button', { name: 'Open navigation' })
  await userEvent.click(menu)
  const home = screen.getByRole('link', { name: 'Datebook' })
  await userEvent.click(home)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' })
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(menu).toHaveAttribute('aria-expanded', 'false')
  expect(menu).toHaveFocus()
})

it('keeps unsaved leave/stay protection when selecting a mobile drawer destination', async () => {
  vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const { router } = mount()
  await enter('Unsaved band')
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Navigation' })).getByRole('link', { name: 'Datebook' }))
  expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  expect(document.documentElement.style.overflow).toBe('')
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(router.state.location.pathname).toBe('/bands/new')
  expect(screen.getByLabelText('Band name')).toHaveValue('Unsaved band')
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Navigation' })).getByRole('link', { name: 'Datebook' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  await screen.findByRole('heading', { name: 'Personal datebook' })
  expect(screen.getByRole('main')).toHaveFocus()
})
