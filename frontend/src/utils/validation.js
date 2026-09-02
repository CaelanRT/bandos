export function required(message = 'This field is required.') {
  return (value) => {
    const missing =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)

    return missing ? message : undefined
  }
}

export function maxLength(limit, message = 'Use ' + limit + ' characters or fewer.') {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new TypeError('Maximum length must be a non-negative integer.')
  }

  return (value) =>
    typeof value === 'string' && value.length > limit ? message : undefined
}

export function composeValidators(...validators) {
  return (value, values) => {
    for (const validator of validators) {
      const error = validator(value, values)

      if (error !== undefined) {
        return error
      }
    }

    return undefined
  }
}

export function validateFields(values, fieldValidators) {
  const errors = {}

  for (const [field, validator] of Object.entries(fieldValidators)) {
    const error = validator(values[field], values)

    if (error !== undefined) {
      errors[field] = error
    }
  }

  return errors
}
