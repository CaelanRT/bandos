// @vitest-environment jsdom
import { sessionFixture } from './fixtures/session.js'
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { bandKeys } from '../features/bands/queries.js'

const fetchMock = vi.fn()
const user = { user_id: 17, username: 'alex', first_name: 'Alex', last_name: 'Rivera',
  email: 'alex@example.com', plan: 'free', is_active: true, version: 1, email_verified_at: null, pending_email: null, created_at: '2026-09-03T10:00:00Z' }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status })
const currentUser = () => response({ data: { user, session: sessionFixture } })
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
  expect(JSON.parse(deletes[0][1].body)).toEqual({ expectedVersion: 1, password: ' wrong ' })
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
  await act(async () => {
    await router.navigate('/')
  })
  const confirmation = await screen.findByRole('dialog', { name: 'Discard your unsaved changes?' })
  expect(within(confirmation).getByText('A change is being saved. Please wait for the result before leaving.')).toBeInTheDocument()
  expect(within(confirmation).getByRole('button', { name: 'Discard changes' })).toBeDisabled()
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
  expect(router.state.historyAction).toBe('REPLACE')
  expect(client.getQueryData(bandKeys.detail(8))).toBeUndefined()
  await act(async () => {
    await router.navigate(-1)
  })
  expect(router.state.location.pathname).toBe('/login')
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument()
})

it('keeps an uncertain deactivation password in memory and retries the original body and key', async () => {
  renderAccount()
  let { dialog } = await openDialog()
  let loseResponse = true
  fetchMock.mockImplementation((url, options) => {
    if (options.method === 'DELETE') return loseResponse ? Promise.reject(new Error('connection lost')) : Promise.resolve(response({ data: { message: 'Account deactivated' } }))
    return Promise.resolve(url.endsWith('/bands') ? bands() : currentUser())
  })
  await userEvent.type(within(dialog).getByLabelText('Current password'), ' secret ')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  await within(dialog).findByRole('button', { name: 'Retry same request' })
  expect(within(dialog).getByLabelText('Current password')).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Deactivate account' })).toBeDisabled()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('link', { name: 'Datebook' }))
  await screen.findByRole('dialog', { name: 'Recover your previous save' })
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  ;({ dialog } = await openDialog())
  expect(within(dialog).getByLabelText('Current password')).toHaveValue(' secret ')
  loseResponse = false
  await userEvent.click(within(dialog).getByRole('button', { name: 'Retry same request' }))
  await screen.findByRole('heading', { name: 'Login' })
  const writes = fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE')
  expect(writes).toHaveLength(2)
  expect(JSON.parse(writes[0][1].body)).toEqual({ password: ' secret ', expectedVersion: 1 })
  expect(writes[1][1].body).toBe(writes[0][1].body)
  expect(writes[1][1].headers.get('Idempotency-Key')).toBe(writes[0][1].headers.get('Idempotency-Key'))
})

it('signs out without claiming deactivation if same-intent recovery finds no session', async () => {
  renderAccount()
  const { dialog } = await openDialog()
  fetchMock.mockImplementation((url, options) => Promise.resolve(options.method === 'DELETE'
    ? failure('INTERNAL_ERROR', 500) : url.endsWith('/bands') ? bands() : failure('AUTHENTICATION_REQUIRED')))
  await userEvent.type(within(dialog).getByLabelText('Current password'), 'secret')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
  await screen.findByRole('button', { name: 'Retry same request' })
  fetchMock.mockImplementation((url) => Promise.resolve(url.endsWith('/bands') ? bands() : failure('AUTHENTICATION_REQUIRED')))
  await userEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(screen.queryByText('Your account has been deactivated.')).not.toBeInTheDocument()
})
