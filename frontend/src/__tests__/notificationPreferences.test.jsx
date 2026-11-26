// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createBandosQueryClient } from '../app/queryClient.js'
import { routes } from '../app/routes.jsx'
import { SessionBoundary } from '../app/SessionBoundary.jsx'
import { bandKeys, eventKeys } from '../features/bands/queries.js'
import { preferenceKeys } from '../features/account/preferences.js'
import { sessionFixture } from './fixtures/session.js'

const fetchMock = vi.fn()
const baseUser = {
  user_id: 17,
  username: 'alex',
  first_name: 'Alex',
  last_name: 'Rivera',
  email: 'alex@example.com',
  plan: 'free',
  is_active: true,
  version: 9,
  email_verified_at: '2026-09-03T10:00:00Z',
  pending_email: null,
  created_at: '2026-09-03T10:00:00Z',
}
const defaultPreferences = {
  version: 4,
  enabled: true,
  invitations: true,
  eventUpdates: true,
  removalsAndCancellations: true,
  invitationResponses: true,
  pollUpdates: true,
  pollResponses: true,
}

const json = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers })
const meResponse = (user = baseUser) => json({ data: { user, session: sessionFixture } })
const bandsResponse = () => json({ data: { bands: [] } })
const prefsResponse = (preferences = defaultPreferences) => json({ data: { preferences } })
const errorResponse = (code, status, details) => json({ error: { code, message: code, details } }, status)

function renderAccount(initialPreferences = defaultPreferences) {
  fetchMock.mockImplementation((url) => {
    if (url.endsWith('/bands')) return Promise.resolve(bandsResponse())
    if (url.endsWith('/users/me/notification-preferences')) return Promise.resolve(prefsResponse(initialPreferences))
    return Promise.resolve(meResponse())
  })
  const router = createMemoryRouter(routes, { initialEntries: ['/account'] })
  const client = createBandosQueryClient()
  render(
    <QueryClientProvider client={client}>
      <SessionBoundary>
        <RouterProvider router={router} />
      </SessionBoundary>
    </QueryClientProvider>,
  )
  return { router, client }
}

const putCalls = () => fetchMock.mock.calls.filter(([url, options]) =>
  url.endsWith('/users/me/notification-preferences') && options?.method === 'PUT')

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(cleanup)

it('loads server defaults, explains user-wide and security-message rules, and recovers from initial load failure', async () => {
  let failLoad = true
  fetchMock.mockImplementation((url) => {
    if (url.endsWith('/bands')) return Promise.resolve(bandsResponse())
    if (url.endsWith('/users/me/notification-preferences')) {
      return failLoad ? Promise.reject(new Error('offline')) : Promise.resolve(prefsResponse({
        ...defaultPreferences,
        eventUpdates: false,
        pollResponses: false,
      }))
    }
    return Promise.resolve(meResponse())
  })
  const router = createMemoryRouter(routes, { initialEntries: ['/account'] })
  const client = createBandosQueryClient()
  render(
    <QueryClientProvider client={client}>
      <SessionBoundary>
        <RouterProvider router={router} />
      </SessionBoundary>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: 'Email notification preferences' })).toBeInTheDocument()
  expect(screen.getByText(/apply across all of your bands/i)).toBeInTheDocument()
  expect(screen.getByText(/security, email verification, email change, and password recovery messages still send/i)).toBeInTheDocument()
  expect(screen.getByText(/never changes your invitations, band access, personal datebook, or reconfirmation/i)).toBeInTheDocument()

  const retryButton = await screen.findByRole('button', { name: 'Retry loading preferences' })
  failLoad = false
  await userEvent.click(retryButton)

  const form = await screen.findByRole('form', { name: 'Email notification preferences' })
  expect(within(form).getByRole('checkbox', { name: 'Email notifications' })).toBeChecked()
  expect(within(form).getByRole('checkbox', { name: 'Invitations' })).toBeChecked()
  expect(within(form).getByRole('checkbox', { name: 'Event updates' })).not.toBeChecked()
  expect(within(form).getByRole('checkbox', { name: 'Removals and cancellations' })).toBeChecked()
  expect(within(form).getByRole('checkbox', { name: 'Invitation responses' })).toBeChecked()
  expect(within(form).getByRole('checkbox', { name: 'Poll updates' })).toBeChecked()
  expect(within(form).getByRole('checkbox', { name: 'Poll responses' })).not.toBeChecked()
  expect(within(form).getByRole('button', { name: 'Save preferences' })).toBeDisabled()
  const getCalls = fetchMock.mock.calls.filter(([url, options]) =>
    url.endsWith('/users/me/notification-preferences') && (options?.method ?? 'GET') === 'GET')
  expect(getCalls.at(-1)[1].headers.get('X-bandos-activity')).toBe('user')
})

it.each([
  ['enabled', 'Email notifications'],
  ['invitations', 'Invitations'],
  ['eventUpdates', 'Event updates'],
  ['removalsAndCancellations', 'Removals and cancellations'],
  ['invitationResponses', 'Invitation responses'],
  ['pollUpdates', 'Poll updates'],
  ['pollResponses', 'Poll responses'],
])('sends exact PUT with independent expectedVersion and no Idempotency-Key when toggling %s', async (field, label) => {
  const { client } = renderAccount()
  const form = await screen.findByRole('form', { name: 'Email notification preferences' })

  const cachedBand = { bandId: 8, name: 'The Quartet', version: 2 }
  const cachedEvent = { eventId: 41, name: 'Rehearsal', status: 'pending' }
  const cachedPoll = { pollId: 12, name: 'Next week' }
  client.setQueryData(bandKeys.detail(8), cachedBand)
  client.setQueryData(eventKeys.detail(8, 41), cachedEvent)
  client.setQueryData(['private', 'band', 8, 'poll', 12], cachedPoll)

  const expectedBooleans = {
    enabled: true,
    invitations: true,
    eventUpdates: true,
    removalsAndCancellations: true,
    invitationResponses: true,
    pollUpdates: true,
    pollResponses: true,
    [field]: false,
  }
  const savedResponse = { version: 5, ...expectedBooleans }
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/users/me/notification-preferences') && options?.method === 'PUT') {
      return Promise.resolve(prefsResponse(savedResponse))
    }
    if (url.endsWith('/users/me/notification-preferences')) return Promise.resolve(prefsResponse(savedResponse))
    if (url.endsWith('/bands')) return Promise.resolve(bandsResponse())
    return Promise.resolve(meResponse())
  })

  await userEvent.click(within(form).getByRole('checkbox', { name: label }))
  await userEvent.click(within(form).getByRole('button', { name: 'Save preferences' }))

  const status = await within(form).findByRole('status')
  expect(status).toHaveTextContent('Notification preferences saved.')
  expect(status).not.toHaveTextContent(/delivered|inbox/i)

  const puts = putCalls()
  expect(puts).toHaveLength(1)
  expect(JSON.parse(puts[0][1].body)).toEqual({ expectedVersion: 4, ...expectedBooleans })
  expect(puts[0][1].headers.has('Idempotency-Key')).toBe(false)
  expect(client.getQueryData(preferenceKeys.current)).toEqual(savedResponse)
  expect(client.getQueryData(bandKeys.detail(8))).toEqual(cachedBand)
  expect(client.getQueryData(eventKeys.detail(8, 41))).toEqual(cachedEvent)
  expect(client.getQueryData(['private', 'band', 8, 'poll', 12])).toEqual(cachedPoll)
  expect(fetchMock.mock.calls.some(([url, options]) =>
    url.includes('/bands') && options?.method && options.method !== 'GET')).toBe(false)
})

it('disables category editing while master is off, preserves selections, and supports Cancel and unsaved navigation guard', async () => {
  const initial = {
    version: 3,
    enabled: true,
    invitations: true,
    eventUpdates: false,
    removalsAndCancellations: true,
    invitationResponses: false,
    pollUpdates: true,
    pollResponses: false,
  }
  const { router } = renderAccount(initial)
  const form = await screen.findByRole('form', { name: 'Email notification preferences' })
  const master = within(form).getByRole('checkbox', { name: 'Email notifications' })
  const invitations = within(form).getByRole('checkbox', { name: 'Invitations' })
  const eventUpdates = within(form).getByRole('checkbox', { name: 'Event updates' })

  await userEvent.click(master)
  expect(master).not.toBeChecked()
  expect(invitations).toBeDisabled()
  expect(invitations).toBeChecked()
  expect(eventUpdates).toBeDisabled()
  expect(eventUpdates).not.toBeChecked()
  expect(within(form).getByText(/category selections below are preserved/i)).toBeInTheDocument()

  await userEvent.click(master)
  expect(master).toBeChecked()
  expect(invitations).toBeEnabled()
  expect(invitations).toBeChecked()
  expect(eventUpdates).toBeEnabled()
  expect(eventUpdates).not.toBeChecked()

  await userEvent.click(master)
  const savedOff = { ...initial, version: 4, enabled: false }
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/users/me/notification-preferences') && options?.method === 'PUT') {
      return Promise.resolve(prefsResponse(savedOff))
    }
    if (url.endsWith('/users/me/notification-preferences')) return Promise.resolve(prefsResponse(savedOff))
    if (url.endsWith('/bands')) return Promise.resolve(bandsResponse())
    return Promise.resolve(meResponse())
  })
  await userEvent.click(within(form).getByRole('button', { name: 'Save preferences' }))
  expect(await within(form).findByRole('status')).toHaveTextContent('Optional email notifications are turned off.')
  expect(JSON.parse(putCalls()[0][1].body)).toEqual({
    expectedVersion: 3,
    enabled: false,
    invitations: true,
    eventUpdates: false,
    removalsAndCancellations: true,
    invitationResponses: false,
    pollUpdates: true,
    pollResponses: false,
  })

  await userEvent.click(master)
  void router.navigate('/')
  expect(await screen.findByRole('dialog')).toHaveTextContent('Discard your unsaved changes?')
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(router.state.location.pathname).toBe('/account')

  await userEvent.click(within(form).getByRole('button', { name: 'Cancel preferences' }))
  expect(master).not.toBeChecked()
  expect(putCalls()).toHaveLength(1)
})

it('preserves draft on stale conflict and network failure, and reloads latest only after explicit confirmation', async () => {
  renderAccount()
  const form = await screen.findByRole('form', { name: 'Email notification preferences' })
  const pollUpdates = within(form).getByRole('checkbox', { name: /Poll updates/i })

  let putMode = 'network'
  let reloadMode = 'fail'
  const latestServer = { ...defaultPreferences, version: 7, invitations: false }
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/users/me/notification-preferences') && options?.method === 'PUT') {
      if (putMode === 'network') return Promise.reject(new Error('connection dropped'))
      if (putMode === 'stale') return Promise.resolve(errorResponse('STALE_VERSION', 409))
      return Promise.resolve(prefsResponse({ ...latestServer, version: 8, pollUpdates: false }))
    }
    if (url.endsWith('/users/me/notification-preferences')) {
      if (reloadMode === 'fail') return Promise.reject(new Error('still offline'))
      return Promise.resolve(prefsResponse(latestServer))
    }
    if (url.endsWith('/bands')) return Promise.resolve(bandsResponse())
    return Promise.resolve(meResponse())
  })

  await userEvent.click(pollUpdates)
  await userEvent.click(within(form).getByRole('button', { name: 'Save preferences' }))
  expect(await within(form).findByRole('alert')).toHaveTextContent(/previous saved settings remain active/i)
  expect(pollUpdates).not.toBeChecked()

  putMode = 'stale'
  await userEvent.click(within(form).getByRole('button', { name: 'Save preferences' }))
  const staleAlert = await within(form).findByRole('alert')
  expect(staleAlert).toHaveTextContent(/changed since you loaded them/i)
  expect(pollUpdates).not.toBeChecked()
  expect(pollUpdates).toBeDisabled()

  await userEvent.click(within(form).getByRole('button', { name: 'Reload latest preferences' }))
  await userEvent.click(within(form).getByRole('button', { name: 'Keep draft' }))
  expect(pollUpdates).not.toBeChecked()

  await userEvent.click(within(form).getByRole('button', { name: 'Reload latest preferences' }))
  await userEvent.click(within(form).getByRole('button', { name: 'Discard changes and reload' }))
  expect(await within(form).findByText(/Reload failed\. Your draft is still here\./i)).toBeInTheDocument()
  expect(pollUpdates).not.toBeChecked()

  reloadMode = 'ok'
  await userEvent.click(within(form).getByRole('button', { name: 'Discard changes and reload' }))
  expect(await within(form).findByRole('status')).toHaveTextContent('Latest notification preferences loaded.')
  expect(pollUpdates).toBeChecked()
  expect(within(form).getByRole('checkbox', { name: 'Invitations' })).not.toBeChecked()

  putMode = 'ok'
  await userEvent.click(pollUpdates)
  await userEvent.click(within(form).getByRole('button', { name: 'Save preferences' }))
  expect(await within(form).findByRole('status')).toHaveTextContent('Notification preferences saved.')
  expect(JSON.parse(putCalls().at(-1)[1].body)).toMatchObject({
    expectedVersion: 7,
    invitations: false,
    pollUpdates: false,
  })
  expect(putCalls().at(-1)[1].headers.has('Idempotency-Key')).toBe(false)
})

it('clears protected preferences cache and redirects to Login when session expires on save', async () => {
  const { client, router } = renderAccount()
  const form = await screen.findByRole('form', { name: 'Email notification preferences' })
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/users/me/notification-preferences') && options?.method === 'PUT') {
      return Promise.resolve(errorResponse('AUTHENTICATION_REQUIRED', 401))
    }
    if (url.endsWith('/bands')) return Promise.resolve(bandsResponse())
    return Promise.resolve(meResponse())
  })

  await userEvent.click(within(form).getByRole('checkbox', { name: /Event updates/i }))
  await userEvent.click(within(form).getByRole('button', { name: 'Save preferences' }))
  expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(client.getQueryData(preferenceKeys.current)).toBeUndefined()
})
