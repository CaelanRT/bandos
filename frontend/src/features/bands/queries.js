import { useActivityQuery, userActivityRequest, fetchActivityQuery } from '../../app/activityQueries.js'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../../app/sessionContext.js'
import { getBand, getBands } from './api.js'

export const bandKeys = {
  list: ['private', 'bands'],
  detail: (bandId) => ['private', 'band', bandId],
}
export const eventKeys = {
  list: (bandId) => ['private', 'band', bandId, 'events'],
  detail: (bandId, eventId) => ['private', 'band', bandId, 'event', eventId],
}
// Future band resources append their resource name to this same prefix.
export const isBandQuery = (query, bandId) => query.queryKey[0] === 'private' &&
  query.queryKey[1] === 'band' && query.queryKey[2] === bandId

const freshness = { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }

export function useBands() {
  const { authenticatedRequest } = useSession()
  return useActivityQuery({ ...freshness, queryKey: bandKeys.list,
    queryFn: ({ signal, activity }) => getBands(activity === 'user' ? userActivityRequest(authenticatedRequest) : authenticatedRequest, signal) })
}

export function useBand(bandId) {
  const { authenticatedRequest } = useSession()
  const client = useQueryClient()
  return useActivityQuery(bandOptions(client, authenticatedRequest, bandId))
}

function bandOptions(client, authenticatedRequest, bandId) {
  return { ...freshness, queryKey: bandKeys.detail(bandId), enabled: bandId !== null,
    queryFn: async ({ signal, activity }) => {
      try {
        const band = await getBand(activity === 'user' ? userActivityRequest(authenticatedRequest) : authenticatedRequest, bandId, signal)
        if (client.getQueryData(bandKeys.detail(bandId))?.currentUserRole === 'leader' && band.currentUserRole !== 'leader') {
          await clearBandResources(client, bandId, signal)
          if (signal.aborted) throw new DOMException('Access changed.', 'AbortError')
        }
        // A denied mutation stays denied until the explicit permission check succeeds.
        return client.getQueryData(bandKeys.detail(bandId))?.managementDenied
          ? { ...band, managementDenied: true } : band
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
export async function cacheSavedBand(client, band, signal) {
  await Promise.all([
    client.cancelQueries({ queryKey: bandKeys.list }),
    client.cancelQueries({ queryKey: bandKeys.detail(band.bandId) }),
  ])
  if (signal.aborted) return false
  const { members: _members, managementDenied: _denied, ...summary } = band
  client.setQueryData(bandKeys.detail(band.bandId), band)
  client.setQueryData(bandKeys.list, (bands = []) => [
    ...bands.filter((item) => item.bandId !== band.bandId), summary,
  ])
  // Read failures must never change a confirmed save into a failed write.
  void client.invalidateQueries({ queryKey: bandKeys.list })
  return true
}

export async function checkBands(client, request, signal, activity = false) {
  await client.cancelQueries({ queryKey: bandKeys.list })
  if (signal.aborted) throw new DOMException('Form closed.', 'AbortError')
  const options = { queryKey: bandKeys.list, staleTime: 0,
    queryFn: ({ signal: querySignal, activity }) => getBands(activity === 'user' ? userActivityRequest(request) : request, querySignal) }
  return activity ? fetchActivityQuery(client, options) : client.fetchQuery(options)
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

export async function checkBand(client, request, bandId, signal, activity = false) {
  await client.cancelQueries({ queryKey: bandKeys.detail(bandId) })
  if (signal.aborted) throw new DOMException('Form closed.', 'AbortError')
  const options = bandOptions(client, request, bandId)
  return activity ? fetchActivityQuery(client, options) : client.fetchQuery(options)
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

// Drop hidden resources and private invitation reasons before permission reloads.
// Keep visible detail identity so an active permission check can finish normally.
export async function clearBandResources(client, bandId, signal) {
  const predicate = query => isBandQuery(query, bandId) && query.queryKey.length > 3
  await client.cancelQueries({ predicate })
  if (signal.aborted) return
  for (const query of client.getQueryCache().findAll({ predicate })) {
    const data = query.state.data
    if (Array.isArray(data)) {
      client.setQueryData(query.queryKey, [])
      continue
    }
    if (data?.hideFromUninvited === true) {
      client.setQueryData(query.queryKey, null)
      continue
    }
    if (!data || data.hideFromUninvited !== false) {
      client.removeQueries({ queryKey: query.queryKey, exact: true })
      continue
    }
    client.setQueryData(query.queryKey, {
      ...data, canManage: false,
      ...(data.slots ? { slots: data.slots.map(slot => {
        if (!slot.invitation) return slot
        const { declineReason: _private, ...invitation } = slot.invitation
        return { ...slot, invitation }
      }) } : {}),
    })
  }
  void client.invalidateQueries({ predicate })
}
