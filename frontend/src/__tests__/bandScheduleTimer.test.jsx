// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { focusManager } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BandSchedule } from '../features/events/BandSchedule.jsx'
import { useEvents } from '../features/events/queries.js'

vi.mock('../features/events/queries.js', () => ({ useEvents: vi.fn() }))

const event = (changes = {}) => ({ eventId: 8, name: 'Boundary rehearsal', type: 'rehearsal', date: '2030-09-16', startTime: '12:01', endTime: '13:00', timezone: 'UTC', location: 'Studio', ...changes })

beforeEach(() => {
  vi.useFakeTimers()
  focusManager.setFocused(undefined)
})

afterEach(() => {
  cleanup()
  focusManager.setFocused(undefined)
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('reclassifies at the next event boundary without refetching', async () => {
  vi.setSystemTime(new Date('2030-09-16T12:00:00Z'))
  const refetch = vi.fn()
  useEvents.mockReturnValue({ data: [event()], isPending: false, isError: false, isFetching: false, refetch })
  render(<MemoryRouter><BandSchedule bandId={2} /></MemoryRouter>)
  expect(screen.getByRole('list', { name: 'Today upcoming events' })).toBeInTheDocument()

  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })

  expect(screen.getByRole('list', { name: 'Today past events' })).toBeInTheDocument()
  expect(refetch).not.toHaveBeenCalled()
})

it('refreshes presentation from the current clock when the window regains focus', () => {
  vi.setSystemTime(new Date('2030-09-16T23:59:00Z'))
  useEvents.mockReturnValue({ data: [event({ date: '2030-09-17', startTime: '12:00' })], isPending: false, isError: false, isFetching: false, refetch: vi.fn() })
  render(<MemoryRouter><BandSchedule bandId={2} /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Tomorrow' })).toBeInTheDocument()

  vi.setSystemTime(new Date('2030-09-17T00:00:00Z'))
  act(() => { focusManager.setFocused(false); focusManager.setFocused(true) })

  expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
})
