import { useEffectEvent, useLayoutEffect, useState } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { useSession } from './sessionContext.js'

export function userActivityRequest(request) {
  return (path, options = {}) => {
    const headers = new Headers(options.headers)
    if ((options.method || 'GET') === 'GET') headers.set('X-bandos-activity', 'user')
    return request(path, { ...options, headers })
  }
}

const queryLoads = new WeakMap()
const explicitLoads = new WeakMap()
const requestActivity = new WeakMap()

function getQueryLoads(client) {
  let loads = queryLoads.get(client)
  if (!loads) { loads = new Map(); queryLoads.set(client, loads) }
  return loads
}

function activityOptions(client, option) {
  return { ...option, queryFn: context => {
    const key = JSON.stringify(option.queryKey)
    const explicit = explicitLoads.get(client)?.delete(key)
    // Query retries share a signal; a later background fetch gets a new one.
    if (explicit) requestActivity.set(context.signal, 'user')
    const activity = requestActivity.get(context.signal)
    const navigationId = getQueryLoads(client).get(key)?.navigationId
    return Promise.resolve(option.queryFn({ ...context, activity })).then(data => {
      if (!context.signal.aborted) {
        const loads = getQueryLoads(client)
        loads.set(key, { ...loads.get(key), source: { activity, navigationId } })
      }
      return data
    })
  } }
}

export function fetchActivityQuery(client, option) {
  void client.cancelQueries({ queryKey: option.queryKey, exact: true })
  let loads = explicitLoads.get(client)
  if (!loads) { loads = new Set(); explicitLoads.set(client, loads) }
  const key = JSON.stringify(option.queryKey)
  loads.add(key)
  const result = client.fetchQuery({ ...activityOptions(client, option), staleTime: 0 })
  loads.delete(key)
  return result
}

// Observer refetches stay passive. Navigation and the returned Refresh callbacks
// explicitly fetch even when the cache contains a fresh mutation response.
export function useActivityQueries(options) {
  const client = useQueryClient()
  const { status, generation } = useSession()
  const location = useLocation()
  const navigationId = JSON.stringify([generation, location.key])
  const signature = JSON.stringify([navigationId, options.map(option => [option.queryKey, option.enabled !== false])])
  const [ready, setReady] = useState(null)
  const fullAccess = status === 'authenticated'

  function load(option) {
    return fetchActivityQuery(client, option).catch(() => undefined)
  }

  const reads = useQueries({ queries: options.map(option => ({ ...activityOptions(client, option),
    enabled: fullAccess && option.enabled !== false && ready === signature,
    staleTime: Infinity, refetchOnMount: false,
    refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
  })) })

  const loadNavigation = useEffectEvent(() => {
    const loads = getQueryLoads(client)
    for (const option of options) {
      if (option.enabled === false) continue
      const key = JSON.stringify(option.queryKey)
      if (loads.get(key)?.navigationId !== navigationId) {
        loads.set(key, { ...loads.get(key), navigationId })
        // New dependent reads inherit their parent's cause. A focus refresh can
        // discover a band, but that discovery must not renew the session.
        if (option.loadSource?.navigationId === navigationId && option.loadSource.activity !== 'user') {
          void client.fetchQuery({ ...activityOptions(client, option), staleTime: 0 }).catch(() => undefined)
        } else {
          void load(option)
        }
      }
    }
  })
  useLayoutEffect(() => {
    if (!fullAccess) return
    loadNavigation()
    // Enable passive observers only after their explicit external load starts.
    // eslint-disable-next-line react/set-state-in-effect
    setReady(signature)
  }, [fullAccess, signature])

  return reads.map((read, index) => ({ ...read,
    loadSource: queryLoads.get(client)?.get(JSON.stringify(options[index].queryKey))?.source,
    refetch: () => fullAccess && load(options[index]),
  }))
}

export function useActivityQuery(options) {
  return useActivityQueries([options])[0]
}
