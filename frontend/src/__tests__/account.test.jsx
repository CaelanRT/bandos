// @vitest-environment jsdom
import { sessionFixture } from './fixtures/session.js'
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { bandKeys } from '../features/bands/queries.js'

const fetchMock = vi.fn()
const backendUser = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true, version: 1, email_verified_at: null, pending_email: null, created_at: '2026-09-03T10:00:00Z' }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status })
const userResponse = (user = backendUser) => response({ data: { user, session: sessionFixture } })
const bandsResponse = () => response({ data: { bands: [] } })
const errorResponse = (code, status, details) => response({ error: { code, message: code, details } }, status)

function renderAccount(entry = '/account') {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  const client = createBandosQueryClient()
  render(<QueryClientProvider client={client}><SessionBoundary>
    <RouterProvider router={router} />
  </SessionBoundary></QueryClientProvider>)
  return { router, client }
}

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url) => url.endsWith('/bands') ? Promise.resolve(bandsResponse()) :
    Promise.resolve(userResponse()))
})
afterEach(cleanup)

it('focuses Account content without scrolling the header out of view', async () => {
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  try {
    const { router } = renderAccount()
    await screen.findByRole('heading', { name: 'Account' })
    const main = screen.getByRole('main')
    expect(main).toHaveFocus()
    expect(focus.mock.calls.some((args, index) =>
      focus.mock.contexts[index] === main && args[0]?.preventScroll === true)).toBe(true)
    await router.navigate('/')
    await screen.findByRole('heading', { name: 'Personal datebook' })
    await router.navigate('/account')
    await screen.findByRole('heading', { name: 'Account' })
    expect(screen.getByRole('main')).toHaveFocus()
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  } finally {
    focus.mockRestore()
  }
})

it('opens protected Account with read-only information and active navigation', async () => {
  renderAccount()
  expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
  expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('alex@example.com')).toBeInTheDocument()
  expect(screen.getByText('free')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
})

it('saves only a trimmed change and updates cached member identity', async () => {
  const { client } = renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  client.setQueryData(bandKeys.detail(8), { bandId: 8, members: [
    { userId: 17, firstName: 'Alex', lastName: 'Rivera', username: 'alex' },
  ] })
  const next = { ...backendUser, username: 'new-name', version: 2 }
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'PATCH') return Promise.resolve(userResponse(next))
    return Promise.resolve(url.endsWith('/bands') ? bandsResponse() : userResponse(next))
  })
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), ' new-name ')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('Profile saved.')
  const patch = fetchMock.mock.calls.find(([, options]) => options.method === 'PATCH')
  expect(JSON.parse(patch[1].body)).toEqual({ expectedVersion: 1, username: 'new-name' })
  expect(patch[1].headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
  expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('new-name')
  expect(client.getQueryData(bandKeys.detail(8)).members[0].username).toBe('new-name')

  const third = { ...next, first_name: 'Jordan', version: 3 }
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'PATCH') return Promise.resolve(userResponse(third))
    return Promise.resolve(url.endsWith('/bands') ? bandsResponse() : userResponse(third))
  })
  await userEvent.clear(screen.getByRole('textbox', { name: 'First name' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'First name' }), 'Jordan')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('Profile saved.')
  const patches = fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')
  expect(JSON.parse(patches[1][1].body)).toEqual({ expectedVersion: 2, firstName: 'Jordan' })
  expect(patches[1][1].headers.get('Idempotency-Key')).not.toBe(patches[0][1].headers.get('Idempotency-Key'))
})

it('blocks invalid input, restores on Cancel, and guards dirty navigation', async () => {
  const { router } = renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  const firstName = screen.getByRole('textbox', { name: 'First name' })
  await userEvent.clear(firstName)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(firstName).toHaveAttribute('aria-invalid', 'true')
  expect(firstName).toHaveFocus()
  expect(fetchMock.mock.calls.some(([, options]) => options.method === 'PATCH')).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(firstName).toHaveValue('Alex')
  await userEvent.type(firstName, 'a')
  void router.navigate('/')
  expect(await screen.findByRole('dialog')).toHaveTextContent('Discard your unsaved changes?')
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(router.state.location.pathname).toBe('/account')
})

it('preserves the draft for conflict feedback', async () => {
  renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  fetchMock.mockImplementation((url, options) => options.method === 'PATCH'
    ? Promise.resolve(errorResponse('ACCOUNT_CONFLICT', 409))
    : Promise.resolve(url.endsWith('/bands') ? bandsResponse() : userResponse()))
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), 'taken')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('That username is unavailable. Choose another.')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('taken')
})

it('associates backend field validation with the correct control', async () => {
  renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  fetchMock.mockImplementation((url, options) => options.method === 'PATCH'
    ? Promise.resolve(errorResponse('VALIDATION_ERROR', 400, [{ field: 'lastName', message: 'Choose another name.' }]))
    : Promise.resolve(url.endsWith('/bands') ? bandsResponse() : userResponse()))
  await userEvent.clear(screen.getByRole('textbox', { name: 'Last name' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Last name' }), 'Smith')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Choose another name.')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Last name' })).toHaveAttribute('aria-describedby', 'account-lastName-error')
  expect(screen.getByRole('textbox', { name: 'Last name' })).toHaveFocus()
})

it('retries an ambiguous profile save using the same request and applies only the authoritative result', async () => {
  const { client } = renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  const next = { ...backendUser, username: 'saved', version: 2 }
  let loseResponse = true
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'PATCH') return loseResponse ? Promise.reject(new Error('connection lost')) : Promise.resolve(userResponse(next))
    return Promise.resolve(url.endsWith('/bands') ? bandsResponse() : userResponse(next))
  })
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), 'saved')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('button', { name: 'Retry same request' })
  expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('saved')
  expect(screen.getByRole('textbox', { name: 'Username' })).toBeDisabled()
  expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument()
  loseResponse = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
  await screen.findByText('Profile saved.')
  const writes = fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')
  expect(writes).toHaveLength(2)
  expect(writes[1][1].body).toBe(writes[0][1].body)
  expect(writes[1][1].headers.get('Idempotency-Key')).toBe(writes[0][1].headers.get('Idempotency-Key'))
  client.clear()
})

it('clears the protected page when authentication expires during Save', async () => {
  const { client, router } = renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  client.setQueryData(bandKeys.detail(8), { bandId: 8, members: [] })
  fetchMock.mockImplementation((url, options) => options.method === 'PATCH'
    ? Promise.resolve(errorResponse('AUTHENTICATION_REQUIRED', 401))
    : Promise.resolve(url.endsWith('/bands') ? bandsResponse() : userResponse()))
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), 'new-name')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(client.getQueryData(bandKeys.detail(8))).toBeUndefined()
})
