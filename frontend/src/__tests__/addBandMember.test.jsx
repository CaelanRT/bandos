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
const leader = { userId: 17, username: 'alex', firstName: 'Alex', lastName: 'Rivera', role: 'leader' }
const zoe = { userId: 20, username: 'zoe', firstName: 'Zoe', lastName: 'Smith', role: 'member' }
const ben = { userId: 21, username: 'ben', firstName: 'Ben', lastName: 'Smith', role: 'member' }
const json = (data, status = 200) => new Response(JSON.stringify({ data }), { status })
const failure = (code, status = 400, details, headers) => new Response(JSON.stringify({ error: { code, message: 'Failed', details } }), { status, headers })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const fetchMock = vi.fn()
let band, post, clients, detailRead, listRead
const dialogDescriptors = Object.fromEntries(['showModal', 'close'].map((name) =>
  [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]))
function mount(entries = ['/bands/2/members']) {
  const client = createBandosQueryClient()
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } })
  clients.push(client)
  const router = createMemoryRouter(routes, { initialEntries: entries, initialIndex: entries.length - 1 })
  render(<QueryClientProvider client={client}><SessionBoundary><RouterProvider router={router} /></SessionBoundary></QueryClientProvider>)
  return { client, router }
}
const posts = () => fetchMock.mock.calls.filter(([url, options]) => url.endsWith('/members') && options.method === 'POST')
async function open() { await userEvent.click(await screen.findByRole('button', { name: 'Add member', exact: true })) }
async function enter(value = 'zoe') { fireEvent.change(await screen.findByLabelText('Username'), { target: { value } }) }
async function submit() { await userEvent.click(screen.getByRole('button', { name: 'Add member', exact: true })) }
beforeEach(() => {
  clients = []
  band = { bandId: 2, name: 'The Band', currentUserRole: 'leader', isActive: true, createdAt: 'opaque', members: [leader] }
  detailRead = () => json({ band }); listRead = () => json({ bands: [band] })
  post = (body) => {
    const member = body.username.toLowerCase() === 'zoe' ? zoe : ben
    band = { ...band, members: [...band.members, member] }
    return json({ member }, 201)
  }
  fetchMock.mockReset().mockImplementation(async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (path === '/users/me') return json({ user })
    if (path === '/bands') return listRead()
    if (path === '/bands/2') return detailRead()
    if (path === '/bands/2/members') return post(JSON.parse(options.body))
    if (path.startsWith('/auth/')) return json({ message: 'OK' })
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

it('adds two users consecutively with exact trimmed bodies, ordered unique rows, clearing and focus', async () => {
  mount(); await open()
  for (const name of ['  zoe  ', ' ben ']) {
    await userEvent.type(screen.getByLabelText('Username'), name)
    await userEvent.keyboard('{Enter}')
    await screen.findByText(`@${name.trim()} added to the band.`)
    await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus())
    expect(screen.getByLabelText('Username')).toHaveValue('')
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'false')
  }
  expect(posts().map(([, options]) => JSON.parse(options.body))).toEqual([{ username: 'zoe' }, { username: 'ben' }])
  expect(within(screen.getByRole('list', { name: 'Band members' })).getAllByRole('listitem').map((row) => row.textContent))
    .toEqual(['Alex Rivera · Leader@alex', 'Ben Smith@ben', 'Zoe Smith@zoe'])
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add member' })).toHaveFocus())
})

it('opens and focuses once from creation state, but not on normal or later visits', async () => {
  const { router } = mount([{ pathname: '/bands/2/members', state: { openAddMember: true } }])
  await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus())
  expect(router.state.location.state?.openAddMember).toBeUndefined()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(() => router.navigate('/bands/2'))
  await act(() => router.navigate('/bands/2/members'))
  expect(await screen.findByRole('button', { name: 'Add member' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
})

it('never exposes addition to members, including with a creation marker', async () => {
  band.currentUserRole = 'member'
  mount([{ pathname: '/bands/2/members', state: { openAddMember: true } }])
  await screen.findByRole('heading', { name: 'Members' })
  expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
})

it('validates trimmed 3–50 JS characters on blur/edit and submit without invented restrictions', async () => {
  mount(); await open()
  const input = screen.getByLabelText('Username')
  expect(input).toHaveAttribute('aria-invalid', 'false')
  fireEvent.blur(input)
  expect(await screen.findByText('Enter a username.')).toBeInTheDocument()
  for (const [value, error] of [[' ab ', 'Use at least 3 characters.'], ['😀'.repeat(25) + 'a', 'Use 50 characters or fewer.']]) {
    await enter(value); await submit()
    expect(screen.getByText(error)).toBeInTheDocument()
    expect(input).toHaveFocus()
  }
  expect(posts()).toHaveLength(0)
  const username = '😀'.repeat(25)
  post = () => { const member = { ...zoe, username }; band.members.push(member); return json({ member }, 201) }
  await enter(' ' + username + ' '); await submit()
  await screen.findByText(`@${username} added to the band.`)
  expect(JSON.parse(posts()[0][1].body)).toEqual({ username })
})

it.each([['USER_NOT_FOUND', 404, 'No active account found with that username.', 'unknown'],
  ['USER_ALREADY_IN_BAND', 409, 'That person is already in this band.', 'alex'],
  ['USER_ALREADY_IN_BAND', 409, 'That person is already in this band.', 'zoe']])
('preserves and focuses %s inline errors for %s', async (code, status, message, name) => {
  post = () => failure(code, status)
  mount(); await open(); await enter(name); await submit()
  expect(await screen.findByText(message)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus())
  expect(screen.getByLabelText('Username')).toHaveValue(name)
  expect(screen.getByLabelText('Username')).toHaveAttribute('aria-describedby', expect.stringContaining('member-username-error'))
  expect(posts()).toHaveLength(1)
})

it('maps backend username and form validation and honors rate limiting', async () => {
  post = () => failure('VALIDATION_ERROR', 400, [{ field: 'username', message: 'Invalid username.' }, { field: 'other', message: 'Other error.' }])
  mount(); await open(); await enter(); await submit()
  expect(await screen.findByText('Invalid username.')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Other error.')
  post = () => failure('TOO_MANY_ATTEMPTS', 429, undefined, { 'Retry-After': '3600' })
  await submit(); await screen.findByText(/Too many attempts. Try again after/)
  await submit(); expect(posts()).toHaveLength(2)
})

it('guards Cancel, SPA links, Back and unload while dirty; keeps edits or discards', async () => {
  const { router } = mount(['/', '/bands/2/members']); await open(); await enter()
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  for (const navigate of [() => userEvent.click(screen.getByRole('button', { name: 'Cancel' })),
    () => userEvent.click(screen.getByRole('link', { name: 'Home' })), () => act(() => router.navigate(-1))]) {
    await navigate(); await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Username')).toHaveValue('zoe')
    expect(router.state.location.pathname).toBe('/bands/2/members')
  }
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  await open(); await enter()
  await userEvent.click(screen.getByRole('link', { name: 'Home' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(router.state.location.pathname).toBe('/')
})

it('prevents overlapping submissions and leaving during a pending write', async () => {
  const pending = deferred(); post = () => pending.promise
  mount(); await open(); await enter(); await submit()
  fireEvent.submit(screen.getByRole('form', { name: 'Add member' }))
  expect(posts()).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await userEvent.click(screen.getByRole('link', { name: 'Home' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  await act(async () => pending.resolve(failure('USER_NOT_FOUND', 404)))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Username')).toHaveValue('zoe')
})

it.each(['network', 'server', 'malformed', 'wrong-status', 'wrong-user'])('reconciles uncertain %s outcomes without attributing a case-insensitive match to the write', async (kind) => {
  post = () => {
    band.members.push(zoe)
    if (kind === 'network') throw new TypeError('Connection lost')
    if (kind === 'server') return failure('INTERNAL_ERROR', 500)
    if (kind === 'wrong-status') return json({ member: zoe })
    if (kind === 'wrong-user') return json({ member: ben }, 201)
    return json({ member: {} }, 201)
  }
  mount(); await open(); await enter(' ZOE '); await submit()
  expect(await screen.findByText('That person is now in the band.')).toBeInTheDocument()
  expect(screen.queryByText(/added to the band/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Username')).toHaveValue(' ZOE ')
  expect(posts()).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Clear and add another' }))
  await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus())
  expect(screen.getByLabelText('Username')).toHaveValue('')
})

it('blocks replay through failed checks until an explicit recheck and retry', async () => {
  const check = deferred()
  post = () => { detailRead = () => check.promise; return failure('INTERNAL_ERROR', 500) }
  mount(); await open(); await enter(); await submit()
  await screen.findByText('Checking band membership…')
  fireEvent.submit(screen.getByRole('form', { name: 'Add member' }))
  await act(async () => check.resolve(failure('INTERNAL_ERROR', 503)))
  await screen.findByRole('button', { name: 'Check again' })
  expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('form', { name: 'Add member' }))
  expect(posts()).toHaveLength(1)
  detailRead = () => json({ band })
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
  const retry = await screen.findByRole('button', { name: 'Try adding again' })
  expect(posts()).toHaveLength(1)
  post = () => { band.members.push(zoe); return json({ member: zoe }, 201) }
  await userEvent.click(retry)
  await screen.findByText('@zoe added to the band.')
  expect(posts()).toHaveLength(2)
})

it.each([false, true])('suppresses denied controls while refreshing permissions, with refresh failure=%s', async (fails) => {
  const check = deferred()
  post = () => { detailRead = () => check.promise; return failure('LEADER_REQUIRED', 403) }
  const { client } = mount(); await open(); await enter(); await submit()
  await screen.findByText('Checking your permissions…')
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
  expect(screen.getByText(/Your permissions changed/)).toBeInTheDocument()
  band.currentUserRole = 'member'
  await act(async () => check.resolve(fails ? failure('INTERNAL_ERROR', 503) : json({ band })))
  if (fails) {
    await screen.findByRole('button', { name: 'Retry permissions' })
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
    detailRead = () => json({ band })
    await userEvent.click(screen.getByRole('button', { name: 'Retry permissions' }))
  }
  await waitFor(() => expect(client.getQueryData(bandKeys.detail(2)).currentUserRole).toBe('member'))
  expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
})

it('closes a dirty form with an explanation when a background read revokes leadership', async () => {
  const { client } = mount(); await open(); await enter()
  band = { ...band, currentUserRole: 'member' }
  await act(() => client.invalidateQueries({ queryKey: bandKeys.detail(2) }))
  expect(await screen.findByText(/Your permissions changed/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Home' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('clears inaccessible band context and resources after BAND_NOT_FOUND', async () => {
  post = () => { listRead = () => json({ bands: [] }); return failure('BAND_NOT_FOUND', 404) }
  const { client } = mount(); await open(); await enter()
  client.setQueryData([...bandKeys.detail(2), 'future-resource'], ['private'])
  await submit()
  await screen.findByRole('heading', { name: 'This band is no longer available' })
  expect(client.getQueryData([...bandKeys.detail(2), 'future-resource'])).toBeUndefined()
  expect(client.getQueryData(bandKeys.list)).toEqual([])
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
})

it('expires without a dirty prompt or mutation replay', async () => {
  post = () => failure('AUTHENTICATION_REQUIRED', 401)
  const { router, client } = mount(); await open(); await enter(); await submit()
  await screen.findByRole('heading', { name: 'Login' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
  expect(router.state.location.state.destination).toBe('/bands/2/members')
  expect(posts()).toHaveLength(1)
})

it('does not repopulate private data after logout with a late successful addition', async () => {
  const pending = deferred(); post = () => pending.promise
  const { client } = mount(); await open(); await enter(); await submit()
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Login' })
  await act(async () => pending.resolve(json({ member: zoe }, 201)))
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})

it('cancels older detail reads so they cannot erase a confirmed addition, and deduplicates returned IDs', async () => {
  const { client } = mount(); await open(); await enter()
  const old = deferred(); let calls = 0
  detailRead = () => ++calls === 1 ? old.promise : json({ band })
  let refresh
  act(() => { refresh = client.invalidateQueries({ queryKey: bandKeys.detail(2) }) })
  await submit(); await screen.findByText('@zoe added to the band.')
  await act(async () => { old.resolve(json({ band: { ...band, members: [leader] } })); await refresh })
  expect(client.getQueryData(bandKeys.detail(2)).members.map((member) => member.userId)).toEqual([17, 20])
  post = () => json({ member: zoe }, 201)
  await enter(); await submit(); await screen.findByText('@zoe added to the band.')
  expect(within(screen.getByRole('list', { name: 'Band members' })).getAllByText('@zoe')).toHaveLength(1)
})

it('retains confirmed addition when revalidation fails', async () => {
  post = () => { detailRead = () => failure('INTERNAL_ERROR', 503); return json({ member: zoe }, 201) }
  mount(); await open(); await enter(); await submit()
  await screen.findByText('@zoe added to the band.')
  await screen.findByText('We couldn’t update this band.')
  expect(screen.getByText('@zoe')).toBeInTheDocument()
  expect(screen.getByLabelText('Username')).toHaveValue('')
  expect(screen.queryByText(/couldn’t confirm/)).not.toBeInTheDocument()
})

it('does not apply late reconciliation to a closed and reopened form', async () => {
  const check = deferred()
  post = () => { detailRead = () => check.promise; return failure('INTERNAL_ERROR', 500) }
  mount(); await open(); await enter(); await submit()
  await screen.findByText('Checking band membership…')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  await open()
  expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled()
  await act(async () => check.resolve(json({ band: { ...band, members: [leader, zoe] } })))
  expect(screen.queryByText('That person is now in the band.')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Username')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Add member' })).toBeEnabled()
})

it('preserves current Members context when its active navigation link is clicked', async () => {
  const { router } = mount(); await open(); await enter()
  const key = router.state.location.key
  await userEvent.click(screen.getByRole('link', { name: 'Members' }))
  expect(router.state.location.key).toBe(key)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Username')).toHaveValue('zoe')
})

it('resumes requested navigation after a confirmed pending addition', async () => {
  const pending = deferred(); post = () => pending.promise
  const { router } = mount(); await open(); await enter(); await submit()
  await userEvent.click(screen.getByRole('link', { name: 'Home' }))
  await screen.findByRole('dialog')
  band.members.push(zoe)
  await act(async () => pending.resolve(json({ member: zoe }, 201)))
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})


it('retains required reconciliation across discarding and reopening after a failed check', async () => {
  post = () => { detailRead = () => failure('INTERNAL_ERROR', 503); return failure('INTERNAL_ERROR', 500) }
  mount(); await open(); await enter(); await submit()
  await screen.findByRole('button', { name: 'Check again' })
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  await open()
  expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled()
  detailRead = () => json({ band })
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add member' })).toBeEnabled())
  expect(screen.getByLabelText('Username')).toHaveValue('')
  expect(posts()).toHaveLength(1)
})
