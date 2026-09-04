import { composeValidators, maxLength, required, validateFields } from '../../utils/validation.js'
import { validateLoginField } from './loginValidation.js'

function minLength(limit) {
  return (value) => typeof value === 'string' && value.length < limit
    ? `Use at least ${limit} characters.`
    : undefined
}

const validators = {
  firstName: composeValidators(required('Enter your first name.'), maxLength(50)),
  lastName: composeValidators(required('Enter your last name.'), maxLength(50)),
  username: composeValidators(required('Enter a username.'), minLength(3), maxLength(50)),
  email: (value) => validateLoginField('email', { email: value }),
  password: composeValidators(
    (value) => typeof value !== 'string' || value.length === 0 ? 'Enter your password.' : undefined,
    minLength(8),
    maxLength(72),
  ),
}

export function normalizeRegistration(values) {
  return {
    username: values.username.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
  }
}

export function validateRegistration(values) {
  return validateFields(normalizeRegistration(values), validators)
}

export function validateRegistrationField(field, values) {
  const normalized = normalizeRegistration(values)
  return validators[field]?.(normalized[field], normalized)
}
