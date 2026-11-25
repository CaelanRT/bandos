import { apiRequest } from './client.js'
import { pick } from './boundary.js'
import { parseUserSession } from './session.js'

export async function login(credentials) {
  return parseUserSession(await apiRequest('/auth/login', {
    method: 'POST', body: pick(credentials, ['email', 'password']), expectedStatus: 200,
  }))
}
export async function register(account) {
  return parseUserSession(await apiRequest('/auth/register', {
    method: 'POST', body: pick(account, ['username', 'firstName', 'lastName', 'email', 'password']), expectedStatus: 201,
  }), 201)
}
