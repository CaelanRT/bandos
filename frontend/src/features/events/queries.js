import { useActivityQuery, userActivityRequest } from '../../app/activityQueries.js'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { INVALID_API_RESPONSE } from '../../api/errors.js'
import { eventKeys, removeBandAccess } from '../bands/queries.js'
import { getEvent, getEvents } from './api.js'

const freshness = { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }

export function useEvent(bandId, eventId, loadSource) {
  const { authenticatedRequest } = useSession()
  const client = useQueryClient()
  const query = useActivityQuery({ ...freshness, loadSource, queryKey: eventKeys.detail(bandId, eventId),
    enabled: bandId !== null && eventId !== null,
    queryFn: async ({ signal, activity }) => {
      try {
        const event = await getEvent(activity === 'user' ? userActivityRequest(authenticatedRequest) : authenticatedRequest, bandId, eventId, signal)
        client.setQueryData(eventKeys.list(bandId), (events) => events?.map((item) =>
          item.eventId === event.eventId ? event : item))
        return event
      } catch (error) {
        if (signal.aborted || !['EVENT_NOT_FOUND', 'NOT_FOUND', INVALID_API_RESPONSE].includes(error.code)) throw error
        await client.cancelQueries({ queryKey: eventKeys.list(bandId) })
        if (signal.aborted) throw error
        client.setQueryData(eventKeys.detail(bandId, eventId), null)
        client.setQueryData(eventKeys.list(bandId), (events) => events?.filter((item) => item.eventId !== eventId))
        return null
      }
    },
  })

  useEffect(() => {
    if (bandId === null || query.error?.code !== 'BAND_NOT_FOUND') return undefined
    const controller = new AbortController()
    void removeBandAccess(client, bandId, controller.signal)
    return () => controller.abort()
  }, [bandId, client, query.error])

  return query
}

export function useEvents(bandId, loadSource) {
  const { authenticatedRequest } = useSession()
  const client = useQueryClient()
  const query = useActivityQuery({ ...eventListOptions(authenticatedRequest, bandId), loadSource })

  useEffect(() => {
    if (bandId === null || query.error?.code !== 'BAND_NOT_FOUND') return undefined
    const controller = new AbortController()
    void removeBandAccess(client, bandId, controller.signal)
    return () => controller.abort()
  }, [bandId, client, query.error])

  return query
}

export function eventListOptions(request, bandId) {
  return { ...freshness, queryKey: eventKeys.list(bandId), enabled: bandId !== null,
    queryFn: ({ signal, activity }) => getEvents(activity === 'user' ? userActivityRequest(request) : request, bandId, signal) }
}

export async function cacheCreatedEvent(client, event, signal) {
  await client.cancelQueries({ queryKey: eventKeys.list(event.bandId) })
  if (signal.aborted) return false
  client.setQueryData(eventKeys.detail(event.bandId, event.eventId), event)
  client.setQueryData(eventKeys.list(event.bandId), (events) => events === undefined ? events : [
    ...events.filter((item) => item.eventId !== event.eventId), event,
  ])
  void client.invalidateQueries({ queryKey: eventKeys.list(event.bandId) })
  return true
}

export async function cacheUpdatedEvent(client, event, signal) {
  await Promise.all([
    client.cancelQueries({ queryKey: eventKeys.list(event.bandId) }),
    client.cancelQueries({ queryKey: eventKeys.detail(event.bandId, event.eventId) }),
  ])
  if (signal.aborted) return false
  client.setQueryData(eventKeys.detail(event.bandId, event.eventId), event)
  client.setQueryData(eventKeys.list(event.bandId), (events) => events === undefined ? events :
    events.map((item) => item.eventId === event.eventId ? event : item))
  void client.invalidateQueries({ queryKey: eventKeys.list(event.bandId) })
  return true
}

export async function cacheDeletedEvent(client, bandId, eventId, signal) {
  await Promise.all([
    client.cancelQueries({ queryKey: eventKeys.list(bandId) }),
    client.cancelQueries({ queryKey: eventKeys.detail(bandId, eventId) }),
  ])
  if (signal.aborted) return false
  client.setQueryData(eventKeys.detail(bandId, eventId), null)
  client.setQueryData(eventKeys.list(bandId), (events) => events?.filter((item) => item.eventId !== eventId))
  void client.invalidateQueries({ queryKey: eventKeys.list(bandId) })
  return true
}

export async function reloadEvent(client, request, bandId, eventId, signal) {
  await client.cancelQueries({ queryKey: eventKeys.detail(bandId, eventId) })
  if (signal.aborted) throw new DOMException('Form closed.', 'AbortError')
  try {
    const event = await getEvent(userActivityRequest(request), bandId, eventId, signal)
    if (!await cacheUpdatedEvent(client, event, signal)) throw new DOMException('Form closed.', 'AbortError')
    return event
  } catch (error) {
    if (signal.aborted) throw error
    if (error.code === 'BAND_NOT_FOUND') await removeBandAccess(client, bandId, signal)
    else if (['EVENT_NOT_FOUND', 'NOT_FOUND'].includes(error.code)) {
      await cacheDeletedEvent(client, bandId, eventId, signal)
      return null
    }
    throw error
  }
}
