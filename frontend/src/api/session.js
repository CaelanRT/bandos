import { apiRequest } from './client.js'
import { normalizeCurrentUser } from './currentUser.js'

export async function getCurrentUser() {
  const data = await apiRequest('/users/me')
  return normalizeCurrentUser(data?.user)
}
