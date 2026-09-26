import { useEffect } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { useBands, removeBandAccess } from '../bands/queries.js'
import { eventListOptions } from '../events/queries.js'
import { resolveLocalDateTime } from '../events/schedule.js'

export function upcomingAcrossBands(bands, reads, now = new Date()) {
  return bands.flatMap((band, index) => reads[index].isSuccess
    ? reads[index].data.flatMap((event) => {
      const start = resolveLocalDateTime(event.date, event.startTime, event.timezone)
      return start !== null && start > now ? [{ band, event, start }] : []
    }) : []).sort((left, right) => left.start - right.start ||
      left.band.bandId - right.band.bandId || left.event.eventId - right.event.eventId)
}

export function useUpcomingAcrossBands(now = new Date()) {
  const bands = useBands()
  const { authenticatedRequest } = useSession()
  const client = useQueryClient()
  const activeBands = bands.data ?? []
  const reads = useQueries({ queries: activeBands.map((band) => eventListOptions(authenticatedRequest, band.bandId)) })
  const inaccessibleKey = activeBands.filter((_, index) => reads[index].error?.code === 'BAND_NOT_FOUND')
    .map((band) => band.bandId).join(',')

  useEffect(() => {
    const controllers = inaccessibleKey.split(',').filter(Boolean).map((bandId) => {
      const controller = new AbortController()
      void removeBandAccess(client, Number(bandId), controller.signal)
      return controller
    })
    return () => controllers.forEach((controller) => controller.abort())
  }, [client, inaccessibleKey])

  const loading = bands.isPending || reads.some((read) => !read.isFetchedAfterMount)
  const failedBands = activeBands.flatMap((band, index) => reads[index].isError &&
    reads[index].error?.code !== 'BAND_NOT_FOUND'
    ? [{ band, retry: reads[index].refetch, isFetching: reads[index].isFetching }] : [])
  const succeededBands = activeBands.filter((_, index) => reads[index].isSuccess)
  return {
    bands,
    loading,
    status: bands.isError && !bands.data ? 'error' : loading ? 'loading' :
      failedBands.length === 0 ? 'success' : succeededBands.length === 0 ? 'error' : 'partial',
    events: loading ? [] : upcomingAcrossBands(activeBands, reads, now),
    succeededBands,
    failedBands,
  }
}
