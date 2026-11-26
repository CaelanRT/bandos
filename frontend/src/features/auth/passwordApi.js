import { apiRequest } from '../../api/client.js'
import { check, text } from '../../api/boundary.js'

export async function requestPasswordReset(email, signal) {
  const data = await apiRequest('/auth/password/forgot', {
    method: 'POST', body: { email }, signal, expectedStatus: 202,
  })
  check(text(data?.message), 202)
  return data.message
}

export async function resetPassword(token, newPassword, signal) {
  const data = await apiRequest('/auth/password/reset', {
    method: 'POST', body: { token, newPassword }, signal, expectedStatus: 200,
  })
  check(text(data?.message))
}
