import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { getBand, getBands } from './api.js'

export const bandKeys = {
  list: ['private', 'bands'],
  detail: (bandId) => ['private', 'band', bandId],
}
// Future band resources append their resource name to this same prefix.
export const isBandQuery = (query, bandId) => query.queryKey[0] === 'private' &&
  query.queryKey[1] === 'band' && query.queryKey[2] === bandId

const freshness = { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }

export function useBands() {
  const { authenticatedRequest } = useSession()
  return useQuery({ ...freshness, queryKey: bandKeys.list,
    queryFn: ({ signal }) => getBands(authenticatedRequest, signal) })
}

export function useBand(bandId) {
  const { authenticatedRequest } = useSession()
  const client = useQueryClient()
  return useQuery(bandOptions(client, authenticatedRequest, bandId))
}

function bandOptions(client, authenticatedRequest, bandId) {
  return { ...freshness, queryKey: bandKeys.detail(bandId), enabled: bandId !== null,
    queryFn: async ({ signal }) => {
      try {
        return await getBand(authenticatedRequest, bandId, signal)
      } catch (error) {
        if (signal.aborted || error.code !== 'BAND_NOT_FOUND') throw error
        // Cancel older list/resource reads before removing access. A null detail is
        // an unavailable result, replacing any cached identity and permissions.
        await client.cancelQueries({ queryKey: bandKeys.list })
        await client.cancelQueries({ predicate: (query) => isBandQuery(query, bandId) && query.queryKey.length > 3 })
        if (signal.aborted) throw error
        client.removeQueries({ predicate: (query) => isBandQuery(query, bandId) && query.queryKey.length > 3 })
        client.setQueryData(bandKeys.list, (bands) => bands?.filter((band) => band.bandId !== bandId))
        void client.invalidateQueries({ queryKey: bandKeys.list })
        return null
      }
    },
  }
}

// Mutation coordination stays outside the form. Cancellation guards reads that
// started before the confirmed write; the signal also guards session/unmount races.
export async function cacheCreatedBand(client, band, signal) {
  await Promise.all([
    client.cancelQueries({ queryKey: bandKeys.list }),
    client.cancelQueries({ queryKey: bandKeys.detail(band.bandId) }),
  ])
  if (signal.aborted) return false
  const { members: _members, ...summary } = band
  client.setQueryData(bandKeys.detail(band.bandId), band)
  client.setQueryData(bandKeys.list, (bands = []) => [
    ...bands.filter((item) => item.bandId !== band.bandId), summary,
  ])
  // Read failures must never change a confirmed creation into a failed write.
  void client.invalidateQueries({ queryKey: bandKeys.list })
  return true
}

export async function checkBands(client, request, signal) {
  await client.cancelQueries({ queryKey: bandKeys.list })
  if (signal.aborted) throw new DOMException('Form closed.', 'AbortError')
  return client.fetchQuery({ queryKey: bandKeys.list, staleTime: 0,
    queryFn: ({ signal: querySignal }) => getBands(request, querySignal) })
}

export async function cacheAddedMember(client, bandId, member, signal) {
  await client.cancelQueries({ queryKey: bandKeys.detail(bandId) })
  if (signal.aborted) return false
  client.setQueryData(bandKeys.detail(bandId), (band) => band ? {
    ...band, members: [...band.members.filter((item) => item.userId !== member.userId), member],
  } : band)
  void client.invalidateQueries({ queryKey: bandKeys.detail(bandId) })
  return true
}

export async function checkBand(client, request, bandId, signal) {
  await client.cancelQueries({ queryKey: bandKeys.detail(bandId) })
  if (signal.aborted) throw new DOMException('Form closed.', 'AbortError')
  return client.fetchQuery(bandOptions(client, request, bandId))
}

export async function removeBandAccess(client, bandId, signal) {
  await Promise.all([
    client.cancelQueries({ queryKey: bandKeys.list }),
    client.cancelQueries({ predicate: (query) => isBandQuery(query, bandId) }),
  ])
  if (signal.aborted) return
  client.removeQueries({ predicate: (query) => isBandQuery(query, bandId) && query.queryKey.length > 3 })
  client.setQueryData(bandKeys.detail(bandId), null)
  client.setQueryData(bandKeys.list, (bands) => bands?.filter((band) => band.bandId !== bandId))
  void client.invalidateQueries({ queryKey: bandKeys.list })
}
