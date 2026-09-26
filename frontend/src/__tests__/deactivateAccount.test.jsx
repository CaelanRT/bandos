// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { bandKeys } from '../features/bands/queries.js'

const fetchMock = vi.fn()
const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true, created_at: '2026-09-03T10:00:00Z' }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status })
const currentUser = () => response({ data: { user } })
const bands = () => response({ data: { bands: [] } })
const failure = (code, status = 401) => response({ error: { code, message: code } }, status)

function renderAccount() {
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/account'], initialIndex: 1 })
  const client = createBandosQueryClient()
  render(<QueryClientProvider client={client}><SessionBoundary>
    <RouterProvider router={router} />
  </SessionBoundary></QueryClientProvider>)
  return { router, client }
}

async function openDialog() {
  await screen.findByRole('heading', { name: 'Account' })
  const trigger = screen.getByRole('button', { name: 'Deactivate account' })
  await userEvent.click(trigger)
  return { trigger, dialog: screen.getByRole('dialog') }
}

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url) => Promise.resolve(url.endsWith('/bands') ? bands() : currentUser()))
})
afterEach(cleanup)

it('explains the effects and returns focus on Cancel and Escape', async () => {
  renderAccount()
  const { trigger, dialog } = await openDialog()
  expect(dialog).toHaveTextContent('@alex')
  expect(dialog).toHaveTextContent('Your access will end')
  expect(dialog).toHaveTextContent('active band member lists')
  expect(dialog).toHaveTextContent('Existing band and event records will remain')
  expect(within(dialog).getByLabelText('Current password')).toHaveFocus()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  await userEvent.click(trigger)
  const reopened = screen.getByRole('dialog')
  await userEvent.keyboard('{Escape}')
  // jsdom does not implement the native dialog cancel event.
  reopened.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
  expect(fetchMock.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(false)
})

it('blocks an empty password, keeps a wrong password correctable, and sends the exact untrimmed body', async () => {
  renderAccount()
  const { dialog } = await openDialog()
  const password = within(dialog).getByLabelText('Current password')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  expect(password).toHaveAttribute('aria-describedby', 'deactivate-password-error')
  expect(password).toHaveFocus()
  expect(fetchMock.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(false)
  fetchMock.mockImplementation((url, options) => Promise.resolve(options.method === 'DELETE'
    ? failure('INVALID_CREDENTIALS') : url.endsWith('/bands') ? bands() : currentUser()))
  await userEvent.type(password, ' wrong ')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  const passwordError = await within(dialog).findByText('That password is incorrect. Try again.')
  expect(passwordError).toHaveFocus()
  expect(password).toHaveValue(' wrong ')
  const deletes = fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')
  expect(deletes).toHaveLength(1)
  expect(JSON.parse(deletes[0][1].body)).toEqual({ password: ' wrong ' })
})

it('prevents duplicate submission and navigation while pending', async () => {
  const { router } = renderAccount()
  const { dialog } = await openDialog()
  let release
  fetchMock.mockImplementation((url, options) => options.method === 'DELETE'
    ? new Promise((resolve) => { release = resolve })
    : Promise.resolve(url.endsWith('/bands') ? bands() : currentUser()))
  await userEvent.type(within(dialog).getByLabelText('Current password'), 'secret')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  expect(within(dialog).getByRole('button', { name: 'Deactivate account' })).toBeDisabled()
  void router.navigate('/')
  expect(await screen.findByText('A change is being saved. Please wait for the result before leaving.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(1)
  release(response({ data: { message: 'Account deactivated' } }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
})

it('clears private state and replaces Account with Login after confirmed deactivation', async () => {
  const { router, client } = renderAccount()
  const { dialog } = await openDialog()
  client.setQueryData(bandKeys.detail(8), { bandId: 8, members: [] })
  fetchMock.mockImplementation((url, options) => Promise.resolve(options.method === 'DELETE'
    ? response({ data: { message: 'Account deactivated' } })
    : url.endsWith('/bands') ? bands() : currentUser()))
  await userEvent.type(within(dialog).getByLabelText('Current password'), 'secret')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  expect(await screen.findByText('Your account has been deactivated.')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(client.getQueryData(bandKeys.detail(8))).toBeUndefined()
  await router.navigate(-1)
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument()
})

it('checks an ambiguous result and requires a deliberate retry', async () => {
  renderAccount()
  const { dialog } = await openDialog()
  let deletes = 0
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'DELETE') { deletes++; return Promise.reject(new Error('connection lost')) }
    return Promise.resolve(url.endsWith('/bands') ? bands() : currentUser())
  })
  await userEvent.type(within(dialog).getByLabelText('Current password'), 'secret')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  expect(await within(dialog).findByText('Your account is still active. You can choose to try deactivation again.')).toBeInTheDocument()
  expect(deletes).toBe(1)
  expect(within(dialog).getByRole('button', { name: 'Deactivate account' })).toBeEnabled()
})

it('keeps deletion unavailable until an ambiguous result can be checked', async () => {
  renderAccount()
  const { dialog } = await openDialog()
  let readFails = true
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'DELETE') return Promise.reject(new Error('connection lost'))
    if (url.endsWith('/users/me')) return readFails ? Promise.reject(new Error('offline')) : Promise.resolve(currentUser())
    return Promise.resolve(bands())
  })
  await userEvent.type(within(dialog).getByLabelText('Current password'), 'secret')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  expect(await within(dialog).findByRole('button', { name: 'Check again' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Deactivate account' })).toBeDisabled()
  readFails = false
  await userEvent.click(within(dialog).getByRole('button', { name: 'Check again' }))
  expect(await within(dialog).findByText('Your account is still active. You can choose to try deactivation again.')).toBeInTheDocument()
})

it('signs out without claiming deactivation if the status check finds no session', async () => {
  renderAccount()
  const { dialog } = await openDialog()
  fetchMock.mockImplementation((url, options) => Promise.resolve(options.method === 'DELETE'
    ? failure('INTERNAL_ERROR', 500) : url.endsWith('/bands') ? bands() : failure('AUTHENTICATION_REQUIRED')))
  await userEvent.type(within(dialog).getByLabelText('Current password'), 'secret')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(screen.queryByText('Your account has been deactivated.')).not.toBeInTheDocument()
})
