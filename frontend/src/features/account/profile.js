import { mutationOptions, pick } from '../../api/boundary.js'
import { composeValidators, maxLength, required, validateFields } from '../../utils/validation.js'
import { normalizeCurrentUser } from '../../api/currentUser.js'
import { invalidApiResponse } from '../../api/errors.js'

export const profileFields = ['firstName', 'lastName', 'username']

const validators = {
  firstName: composeValidators(required('Enter your first name.'), maxLength(50)),
  lastName: composeValidators(required('Enter your last name.'), maxLength(50)),
  username: composeValidators(required('Enter a username.'),
    (value) => value.length < 3 ? 'Use at least 3 characters.' : undefined, maxLength(50)),
}

export function normalizeProfile(values) {
  return Object.fromEntries(profileFields.map((field) => [field, values[field].trim()]))
}

export function validateProfile(values) {
  return validateFields(normalizeProfile(values), validators)
}

export function changedProfile(values, user) {
  const normalized = normalizeProfile(values)
  return Object.fromEntries(profileFields.filter((field) => normalized[field] !== user[field])
    .map((field) => [field, normalized[field]]))
}

export function profileValues(user) {
  return Object.fromEntries(profileFields.map((field) => [field, user[field]]))
}

export async function readProfile(request, signal) {
  const data = await request('/users/me', { signal, expectedStatus: 200 })
  return normalizeCurrentUser(data?.user)
}

export async function saveProfile(request, changes, userId, signal, options) {
  const data = await request('/users/me', { method: 'PATCH', body: pick(changes, ['expectedVersion', ...profileFields]), ...mutationOptions(signal, options), expectedStatus: 200 })
  const user = normalizeCurrentUser(data?.user)
  if (user.userId !== userId) throw invalidApiResponse(200)
  return user
}

export async function deactivateAccount(request, input, signal, options) {
  const data = await request('/users/me', { method: 'DELETE',
    body: pick(input, ['expectedVersion', 'password']), ...mutationOptions(signal, options), expectedStatus: 200 })
  if (data?.message !== 'Account deactivated') throw invalidApiResponse(200)
}
