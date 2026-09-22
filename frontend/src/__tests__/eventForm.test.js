import { expect, it } from 'vitest'
import { changedEventValues, emptyEventValues, normalizeEventValues, validateEventValues } from '../features/events/eventForm.js'

const future = { name: '  Practice  ', type: 'rehearsal', date: '2030-09-16', startTime: '15:05', endTime: '16:35', timezone: ' UTC ', location: '  Studio  ', description: '  Bring charts.  ' }

it('normalizes the complete event creation body', () => {
  expect(normalizeEventValues(future)).toEqual({
    name: 'Practice', type: 'rehearsal', date: '2030-09-16', startTime: '15:05', endTime: '16:35', timezone: 'UTC', location: 'Studio', description: 'Bring charts.',
  })
  expect(normalizeEventValues({ ...future, description: '   ' }).description).toBeNull()
})

it('builds an edit body from only normalized changed values', () => {
  expect(changedEventValues({ ...future, name: 'Practice', location: '  Hall  ', description: ' ' }, future)).toEqual({
    location: 'Hall', description: null,
  })
})

it('requires deliberate valid local schedule values', () => {
  expect(validateEventValues(emptyEventValues, new Date('2026-01-01T00:00:00Z'))).toMatchObject({
    name: expect.any(String), type: expect.any(String), date: expect.any(String), startTime: expect.any(String), endTime: expect.any(String), timezone: expect.any(String), location: expect.any(String),
  })
  expect(validateEventValues({ ...future, endTime: '15:05' }, new Date('2026-01-01T00:00:00Z')).endTime).toMatch(/later/)
  expect(validateEventValues({ ...future, date: '2020-01-01' }, new Date('2026-01-01T00:00:00Z')).startTime).toMatch(/future/)
  expect(validateEventValues({ ...future, date: '2030-03-10', startTime: '01:30', endTime: '02:30', timezone: 'America/New_York' }, new Date('2026-01-01T00:00:00Z')).endTime).toMatch(/does not exist/)
})
