import {
  composeValidators,
  maxLength,
  required,
  validateFields,
} from '../../utils/validation.js'

function emailAddress(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined
  }

  const email = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? undefined
    : 'Enter a valid email address.'
}

const validators = {
  email: composeValidators(
    required('Enter your email address.'),
    maxLength(254),
    emailAddress,
  ),
  password: composeValidators(
    required('Enter your password.'),
    maxLength(72),
  ),
}

export function validateLogin(values) {
  return validateFields(values, validators)
}

export function validateLoginField(field, values) {
  return validators[field]?.(values[field], values)
}

export function normalizeLogin(values) {
  return {
    email: values.email.trim().toLowerCase(),
    password: values.password,
  }
}
