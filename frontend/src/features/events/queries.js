import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { INVALID_API_RESPONSE } from '../../api/errors.js'
import { eventKeys } from '../bands/queries.js'
import { getEvent } from './api.js'

const freshness = { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }

export function useEvent(bandId, eventId) {
  const { authenticatedRequest } = useSession()
  const client = useQueryClient()
  return useQuery({ ...freshness, queryKey: eventKeys.detail(bandId, eventId),
    enabled: bandId !== null && eventId !== null,
    queryFn: async ({ signal }) => {
      try {
        const event = await getEvent(authenticatedRequest, bandId, eventId, signal)
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
}
