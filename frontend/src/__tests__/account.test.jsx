// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { bandKeys } from '../features/bands/queries.js'

const fetchMock = vi.fn()
const backendUser = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true, created_at: '2026-09-03T10:00:00Z' }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status })
const userResponse = (user = backendUser) => response({ data: { user } })
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

it('opens protected Account with read-only information and active navigation', async () => {
  renderAccount()
  expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
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
  const next = { ...backendUser, username: 'new-name' }
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'PATCH') return Promise.resolve(userResponse(next))
    return Promise.resolve(url.endsWith('/bands') ? bandsResponse() : userResponse(next))
  })
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), ' new-name ')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('Profile saved.')
  const patch = fetchMock.mock.calls.find(([, options]) => options.method === 'PATCH')
  expect(JSON.parse(patch[1].body)).toEqual({ username: 'new-name' })
  expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('new-name')
  expect(client.getQueryData(bandKeys.detail(8)).members[0].username).toBe('new-name')
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

it('checks an ambiguous save before allowing another attempt', async () => {
  renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'PATCH') return Promise.reject(new Error('connection lost'))
    if (url.endsWith('/users/me')) return Promise.resolve(userResponse({ ...backendUser, username: 'saved' }))
    return Promise.resolve(bandsResponse())
  })
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), 'saved')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('saved'))
  expect(await screen.findByText('Your profile changes are saved.')).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(1)
})

it('keeps Save unavailable until a failed ambiguous read is checked again', async () => {
  renderAccount()
  await screen.findByRole('heading', { name: 'Account' })
  let readFails = true
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'PATCH') return Promise.reject(new Error('connection lost'))
    if (url.endsWith('/users/me')) return readFails ? Promise.reject(new Error('offline')) : Promise.resolve(userResponse())
    return Promise.resolve(bandsResponse())
  })
  await userEvent.clear(screen.getByRole('textbox', { name: 'Username' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Username' }), 'retry-name')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('button', { name: 'Check again' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  readFails = false
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
  expect(await screen.findByText(/current profile differs/)).toBeInTheDocument()
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
