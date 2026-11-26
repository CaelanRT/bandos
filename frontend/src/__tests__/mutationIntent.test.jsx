// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors.js'
import { isKeyedMutation, useMutationIntent } from '../mutations/useMutationIntent.js'
import { MutationRecovery } from '../mutations/MutationRecovery.jsx'

afterEach(cleanup)
const error = (code, status = 409) => new ApiError(code, { code, status })

it('recovers committed response loss with exactly the same method/path/body/key and stable clientKeys', async () => {
  const saved = { version: 5 }
  const committed = new Map()
  const calls = []
  const request = vi.fn(async (path, options) => {
    const key = options.headers.get('Idempotency-Key')
    calls.push({ path, method: options.method, body: JSON.stringify(options.body), key })
    if (committed.has(key)) return committed.get(key)
    committed.set(key, saved)
    throw error('NETWORK_ERROR', null)
  })
  const { result } = renderHook(() => useMutationIntent(request))
  const body = { expectedVersion: 4, expectedVoteVersion: 0,
    slots: [{ clientKey: crypto.randomUUID(), userId: 17 }],
    options: [{ clientKey: crypto.randomUUID(), date: '2030-01-01' }] }
  await act(async () => {
    try { await result.current.request('/bands/2/polls/3', { method: 'PATCH', body }) }
    catch (failure) { expect(result.current.handleError(failure)).toBe(true) }
  })
  expect(result.current.state).toBe('uncertain')
  body.slots[0].userId = 99
  await expect(result.current.request('/bands/9/events', { method: 'POST', body })).rejects.toMatchObject({ code: 'INTENT_UNRESOLVED' })
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => result.current.retry(async () => {
    expect(await result.current.request('/bands/9/events', { method: 'POST', body })).toBe(saved)
    result.current.complete()
  }))
  expect(calls[1]).toEqual(calls[0])
  expect(calls[0].key).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i)
  expect(committed.size).toBe(1)
  expect(result.current.locked).toBe(false)
  await act(async () => {
    try { await result.current.request('/bands/9/events', { method: 'POST', body }) }
    catch (failure) { result.current.handleError(failure) }
  })
  expect(calls[2].key).not.toBe(calls[0].key)
})

it('blocks concurrent writes synchronously and treats REQUEST_IN_PROGRESS as the same intent', async () => {
  let resolve
  const request = vi.fn(() => new Promise(done => { resolve = done }))
  const { result } = renderHook(() => useMutationIntent(request))
  const pending = result.current.request('/users/me', { method: 'PATCH', body: { expectedVersion: 1 } })
  await expect(result.current.request('/users/me', { method: 'PATCH', body: {} })).rejects.toMatchObject({ code: 'INTENT_PENDING' })
  expect(request).toHaveBeenCalledTimes(1)
  resolve({ user: {} }); await pending
  act(() => result.current.handleError(error('REQUEST_IN_PROGRESS')))
  const key = request.mock.calls[0][1].headers.get('Idempotency-Key')
  request.mockResolvedValue({ user: {} })
  await act(async () => result.current.retry(() => result.current.request('/users/me', { method: 'PATCH', body: {} })))
  expect(request.mock.calls[1][1].headers.get('Idempotency-Key')).toBe(key)
})

it('requires explicit stale reload and blocks mismatched key recovery', async () => {
  const request = vi.fn()
  const { result } = renderHook(() => useMutationIntent(request))
  await result.current.request('/bands/2', { method: 'PATCH', body: { expectedVersion: 1 } })
  act(() => result.current.handleError(error('STALE_VERSION')))
  expect(result.current.state).toBe('stale')
  await result.current.retry(() => request())
  expect(request).toHaveBeenCalledOnce()
  act(() => result.current.handleError(error('IDEMPOTENCY_KEY_REUSED')))
  expect(result.current.state).toBe('mismatch')
  await result.current.retry(() => request())
  expect(request).toHaveBeenCalledOnce()
})

it.each([
  ['/auth/register', 'POST', false], ['/auth/login', 'POST', false], ['/auth/logout', 'POST', false],
  ['/auth/password/reset', 'POST', false], ['/auth/verification/confirm', 'POST', false],
  ['/users/me/notification-preferences', 'PUT', false], ['/users/me', 'GET', false],
  ['/users/me', 'PATCH', true], ['/users/me/email-change/resend', 'POST', true],
  ['/bands', 'POST', true], ['/bands/2/events/4', 'DELETE', true], ['/bands/2/polls/3/availability', 'PUT', true],
])('classifies endpoint %s %s without replay assumptions for exempt endpoints', async (path, method, keyed) => {
  expect(isKeyedMutation(path, method)).toBe(keyed)
  const request = vi.fn().mockResolvedValue({})
  const { result } = renderHook(() => useMutationIntent(request))
  await result.current.request(path, { method, body: {} })
  expect(Boolean(request.mock.calls[0][1].headers?.get('Idempotency-Key'))).toBe(keyed)
})

it('keeps a stale draft until explicit discard, preserves it on failed reload, and supports cancellation', async () => {
  const mutation = { state: 'stale', complete: vi.fn() }
  const reload = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({})
  render(<MutationRecovery mutation={mutation} onReload={reload} />)
  expect(screen.getByRole('alert')).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
  await userEvent.click(screen.getByRole('button', { name: 'Keep draft' }))
  expect(reload).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes and reload' }))
  expect(await screen.findByText(/Reload failed/)).toBeInTheDocument()
  expect(mutation.complete).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes and reload' }))
  expect(mutation.complete).toHaveBeenCalledOnce()
})

it('never offers stored replay or automatically retries a failed auth token consumption', async () => {
  const failure = error('NETWORK_ERROR', null)
  const request = vi.fn().mockRejectedValue(failure)
  const { result } = renderHook(() => useMutationIntent(request))
  await expect(result.current.request('/auth/verification/confirm', { method: 'POST', body: { token: 'in-memory' } })).rejects.toBe(failure)
  act(() => expect(result.current.handleError(failure)).toBe(false))
  expect(result.current.state).toBeNull()
  await result.current.retry(() => request())
  expect(request).toHaveBeenCalledOnce()
})

it('clears only the denied band’s hidden content and private reasons and ignores an older read', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  const { clearBandResources, bandKeys, eventKeys } = await import('../features/bands/queries.js')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const visible = { eventId: 4, hideFromUninvited: false, canManage: true,
    slots: [{ invitation: { userId: 2, declineReason: 'Private' } }] }
  client.setQueryData(bandKeys.detail(2), { currentUserRole: 'leader' })
  client.setQueryData(eventKeys.detail(2, 4), visible)
  client.setQueryData(eventKeys.detail(2, 5), { hideFromUninvited: true, name: 'Hidden' })
  client.setQueryData(eventKeys.detail(3, 4), visible)
  let resolve
  const old = client.fetchQuery({ queryKey: eventKeys.detail(2, 4), queryFn: () => new Promise(done => { resolve = done }), staleTime: 0 }).catch(() => {})
  await clearBandResources(client, 2, new AbortController().signal)
  resolve(visible); await old
  expect(client.getQueryData(eventKeys.detail(2, 4))).toEqual({ ...visible, canManage: false, slots: [{ invitation: { userId: 2 } }] })
  expect(client.getQueryData(eventKeys.detail(2, 5))).toBeNull()
  expect(client.getQueryData(bandKeys.detail(2))).toEqual({ currentUserRole: 'leader' })
  expect(client.getQueryData(eventKeys.detail(3, 4))).toEqual(visible)
  client.clear()
})
