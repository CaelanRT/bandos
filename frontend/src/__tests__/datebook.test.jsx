// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { focusManager } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Datebook } from '../features/datebook/Datebook.jsx'
import { groupDatebookEvents } from '../features/datebook/grouping.js'
import { useUpcomingAcrossBands } from '../features/datebook/queries.js'

vi.mock('../features/datebook/queries.js', () => ({ useUpcomingAcrossBands: vi.fn() }))

const band = (bandId, name) => ({ bandId, name })
const entry = (bandId, eventId, date, startTime, instant, changes = {}) => ({
  band: band(bandId, `Band ${bandId}`),
  event: { eventId, date, startTime, name: `Event ${eventId}`, type: 'rehearsal', location: 'Studio', ...changes },
  start: new Date(instant),
})
const first = entry(2, 3, '2030-09-16', '11:00', '2030-09-16T11:00:00Z')
const second = entry(1, 4, '2030-09-17', '12:00', '2030-09-17T12:00:00Z', { type: 'performance', location: 'The Hall' })
const third = entry(2, 5, '2030-09-16', '13:00', '2030-09-17T13:00:00Z')

function result(changes = {}) {
  return { status: 'success', events: [], bands: { data: [band(1, 'Band 1'), band(2, 'Band 2')] },
    failedBands: [], ...changes }
}

function mount() { render(<MemoryRouter><main><Datebook /></main></MemoryRouter>) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-09-16T10:00:00Z'))
  focusManager.setFocused(undefined)
})
afterEach(() => {
  cleanup()
  focusManager.setFocused(undefined)
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('groups only adjacent stored dates even when a date recurs in actual-start order', () => {
  expect(groupDatebookEvents([first, second, third], new Date('2030-09-16T10:00:00Z'))
    .map(({ date, events }) => [date, events.map(({ event }) => event.eventId)]))
    .toEqual([['2030-09-16', [3]], ['2030-09-17', [4]], ['2030-09-16', [5]]])
})

it('features the earliest once and links later rows with local fields and recurring headings', () => {
  useUpcomingAcrossBands.mockReturnValue(result({ events: [first, second, third] }))
  mount()
  const main = screen.getByRole('main')
  const links = within(main).getAllByRole('link')
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/bands/2/events/3', '/bands/1/events/4', '/bands/2/events/5',
  ])
  expect(links[0]).toHaveTextContent('2030-09-16 · 11:00 AM')
  expect(links[0]).toHaveTextContent('Event 3')
  expect(links[0]).toHaveTextContent('Band 2 · Rehearsal')
  expect(links[0]).toHaveTextContent('Studio')
  expect(links[1]).toHaveTextContent('2030-09-17 · 12:00 PM')
  expect(links[1]).toHaveTextContent('Band 1 · Performance')
  expect(links[1]).toHaveTextContent('The Hall')
  expect(within(main).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent))
    .toEqual(['Tomorrow', 'Today'])
  expect(within(main).queryByText('Band 1 schedule')).not.toBeInTheDocument()
})

it('shows loading, named partial failures, and targeted Retry with usable events', () => {
  const retry = vi.fn()
  useUpcomingAcrossBands.mockReturnValue(result({ status: 'loading' }))
  const { rerender } = render(<MemoryRouter><main><Datebook /></main></MemoryRouter>)
  expect(screen.getByText('Loading datebook…')).toBeInTheDocument()
  useUpcomingAcrossBands.mockReturnValue(result({ status: 'partial', events: [first],
    failedBands: [{ band: band(1, 'Band 1'), retry, isFetching: false }] }))
  rerender(<MemoryRouter><main><Datebook /></main></MemoryRouter>)
  expect(screen.getByRole('alert')).toHaveTextContent('Band 1')
  expect(screen.getByRole('link', { name: /Event 3/ })).toHaveAttribute('href', '/bands/2/events/3')
  screen.getByRole('button', { name: 'Retry Band 1' }).click()
  expect(retry).toHaveBeenCalledOnce()
})

it('distinguishes complete failure, empty results, and zero bands', () => {
  const retry = vi.fn()
  useUpcomingAcrossBands.mockReturnValue(result({ status: 'error',
    failedBands: [{ band: band(1, 'Band 1'), retry, isFetching: false }] }))
  const { rerender } = render(<MemoryRouter><main><Datebook /></main></MemoryRouter>)
  expect(screen.getByText('We couldn’t load your datebook. Retry a band below.')).toBeInTheDocument()
  expect(screen.queryByText('No upcoming events.')).not.toBeInTheDocument()
  useUpcomingAcrossBands.mockReturnValue(result({ status: 'partial',
    failedBands: [{ band: band(1, 'Band 1'), retry, isFetching: false }] }))
  rerender(<MemoryRouter><main><Datebook /></main></MemoryRouter>)
  expect(screen.getByText('No upcoming events.')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Band schedules' })).toHaveTextContent('Band 2 schedule')
  useUpcomingAcrossBands.mockReturnValue(result({ bands: { data: [] } }))
  rerender(<MemoryRouter><main><Datebook /></main></MemoryRouter>)
  expect(screen.queryByText('No upcoming events.')).not.toBeInTheDocument()
})

it('advances at the next event start and browser-local midnight without refetching', async () => {
  const later = entry(2, 6, '2030-09-17', '13:00', '2030-09-17T13:00:00Z')
  useUpcomingAcrossBands.mockImplementation((now) => result({ events: [first, second, later].filter(({ start }) => start > now) }))
  mount()
  expect(screen.getByRole('link', { name: /Event 3/ })).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000) })
  expect(screen.queryByRole('link', { name: /Event 3/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Event 4/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Next event' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(13 * 60 * 60 * 1000) })
  expect(useUpcomingAcrossBands.mock.lastCall[0]).toEqual(new Date('2030-09-17T00:00:00Z'))
  expect(screen.getByRole('link', { name: /Event 4/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
})
