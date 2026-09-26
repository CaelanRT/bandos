import { bandKeys } from '../bands/queries.js'

export async function reconcileProfileMembers(client, user, signal) {
  await client.cancelQueries({ predicate: (query) => query.queryKey[0] === 'private' &&
    query.queryKey[1] === 'band' && query.queryKey.length === 3 })
  if (signal.aborted) return
  client.setQueriesData({ predicate: (query) => query.queryKey[0] === 'private' &&
    query.queryKey[1] === 'band' && query.queryKey.length === 3 }, (band) => band?.members ? {
    ...band,
    members: band.members.map((member) => member.userId === user.userId
      ? { ...member, firstName: user.firstName, lastName: user.lastName, username: user.username } : member),
  } : band)
  void client.invalidateQueries({ queryKey: bandKeys.list })
  void client.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'private' &&
    query.queryKey[1] === 'band' && query.queryKey.length === 3 })
}
