// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionContext } from '../app/sessionContext.js'
import { createBandosQueryClient } from '../app/queryClient.js'
import { bandKeys, eventKeys } from '../features/bands/queries.js'
import { upcomingAcrossBands, useUpcomingAcrossBands } from '../features/datebook/queries.js'

const band = (bandId) => ({ bandId, name: `Band ${bandId}`, isActive: true,
  createdAt: 'opaque', currentUserRole: 'member' })
const event = (bandId, eventId, changes = {}) => ({ eventId, bandId, name: `Event ${eventId}`,
  type: 'rehearsal', date: '2030-01-01', startTime: '12:00', endTime: '13:00', timezone: 'UTC',
  location: 'Studio', description: null, createdByUserId: 1, isActive: true,
  createdAt: 'opaque', updatedAt: 'opaque', ...changes })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const apiError = (code) => Object.assign(new Error(code), { code })
const now = new Date('2030-01-01T10:00:00Z')
let client

function Probe() {
  const result = useUpcomingAcrossBands(now)
  return <div>
    <span data-testid="status">{result.status}</span>
    <span data-testid="events">{result.events.map(({ event: item }) => item.eventId).join(',')}</span>
    <span data-testid="failed">{result.failedBands.map(({ band: item }) => item.bandId).join(',')}</span>
    <span data-testid="succeeded">{result.succeededBands.map((item) => item.bandId).join(',')}</span>
    {result.failedBands.map(({ band: item, retry }) =>
      <button key={item.bandId} onClick={() => retry()}>Retry {item.bandId}</button>)}
  </div>
}

function mount(request, seed) {
  client = createBandosQueryClient()
  seed?.(client)
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
  render(<QueryClientProvider client={client}>
    <SessionContext.Provider value={{ authenticatedRequest: request }}><Probe /></SessionContext.Provider>
  </QueryClientProvider>)
}

afterEach(() => { cleanup(); client?.clear() })

it('joins future starts by actual instant, then band and event IDs', () => {
  const bands = [band(2), band(1)]
  const reads = [
    { isSuccess: true, data: [event(2, 5, { startTime: '09:00', timezone: 'America/Los_Angeles' }),
      event(2, 4, { startTime: '10:00' }), event(2, 1, { startTime: '11:00' })] },
    { isSuccess: true, data: [event(1, 9, { startTime: '06:00', timezone: 'America/New_York' }),
      event(1, 2, { startTime: '11:00' }), event(1, 1, { startTime: '11:00' })] },
  ]
  expect(upcomingAcrossBands(bands, reads, now).map(({ band: item, event: entry }) =>
    [item.bandId, entry.eventId])).toEqual([[1, 1], [1, 2], [1, 9], [2, 1], [2, 5]])
})

it('starts all band reads together and waits for settlement before exposing results', async () => {
  const first = deferred(), second = deferred()
  const request = vi.fn((path) => path === '/bands' ? Promise.resolve({ bands: [band(1), band(2)] }) :
    path === '/bands/1/events' ? first.promise : second.promise)
  mount(request)
  await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/events'))).toHaveLength(2))
  expect(screen.getByTestId('status')).toHaveTextContent('loading')
  await act(async () => first.resolve({ events: [event(1, 1)] }))
  expect(screen.getByTestId('status')).toHaveTextContent('loading')
  expect(screen.getByTestId('events')).toBeEmptyDOMElement()
  await act(async () => second.resolve({ events: [event(2, 2)] }))
  expect(await screen.findByTestId('status')).toHaveTextContent('success')
  expect(screen.getByTestId('events')).toHaveTextContent('1,2')
})

it('hides failed cached events and retries only that band while retaining successful data', async () => {
  const responses = new Map([[1, { events: [event(1, 1)] }], [2, apiError('TEMPORARY')]])
  const request = vi.fn((path) => path === '/bands' ? Promise.resolve({ bands: [band(1), band(2)] }) :
    responses.get(Number(path.match(/bands\/(\d+)/)[1])) instanceof Error
      ? Promise.reject(responses.get(Number(path.match(/bands\/(\d+)/)[1])))
      : responses.get(Number(path.match(/bands\/(\d+)/)[1])))
  mount(request, (queryClient) => queryClient.setQueryData(eventKeys.list(2), [event(2, 2)]))
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('partial'))
  expect(screen.getByTestId('events')).toHaveTextContent('1')
  expect(screen.getByTestId('failed')).toHaveTextContent('2')
  responses.set(2, { events: [event(2, 3)] })
  const successfulReadCount = request.mock.calls.filter(([path]) => path === '/bands/1/events').length
  await act(async () => screen.getByRole('button', { name: 'Retry 2' }).click())
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'))
  expect(screen.getByTestId('events')).toHaveTextContent('1,3')
  expect(request.mock.calls.filter(([path]) => path === '/bands/1/events')).toHaveLength(successfulReadCount)
  act(() => client.setQueryData(eventKeys.list(1), [event(1, 4)]))
  await waitFor(() => expect(screen.getByTestId('events')).toHaveTextContent('4,3'))
  act(() => client.setQueryData(bandKeys.list, [band(2)]))
  await waitFor(() => expect(screen.getByTestId('events')).toHaveTextContent('3'))
})

it('removes an inaccessible band through shared recovery and distinguishes complete failure', async () => {
  let listed = [band(1), band(2)]
  const request = vi.fn((path) => {
    if (path === '/bands') return Promise.resolve({ bands: listed })
    if (path === '/bands/1/events') {
      listed = [band(2)]
      return Promise.reject(apiError('BAND_NOT_FOUND'))
    }
    return Promise.reject(apiError('TEMPORARY'))
  })
  mount(request)
  await waitFor(() => expect(client.getQueryData(bandKeys.list)?.map((item) => item.bandId)).toEqual([2]))
  expect(client.getQueryData(eventKeys.list(1))).toBeUndefined()
  expect(client.getQueryData(['private', 'band', 1])).toBeNull()
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
  expect(screen.getByTestId('failed')).toHaveTextContent('2')
})
