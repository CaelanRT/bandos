import { describe, expect, it } from 'vitest'
import {
  composeValidators,
  maxLength,
  required,
  validateFields,
} from '../utils/validation.js'

describe('generic validation primitives', () => {
  it.each(['value', '  value  ', 0, false, ['value']])(
    'accepts a present value (%s)',
    (value) => {
      expect(required()(value)).toBeUndefined()
    },
  )

  it.each([undefined, null, '', '   ', []])(
    'rejects a missing value (%s)',
    (value) => {
      expect(required('Enter a value.')(value)).toBe('Enter a value.')
    },
  )

  it('checks string length without making optional values required', () => {
    const validator = maxLength(5)

    expect(validator(undefined)).toBeUndefined()
    expect(validator('short')).toBeUndefined()
    expect(validator('too long')).toBe('Use 5 characters or fewer.')
  })

  it('rejects invalid maximum-length configuration', () => {
    expect(() => maxLength(-1)).toThrow(TypeError)
    expect(() => maxLength(1.5)).toThrow(TypeError)
  })

  it('composes validators and returns the first applicable message', () => {
    const validator = composeValidators(
      required('Enter a name.'),
      maxLength(5, 'Keep the name short.'),
    )

    expect(validator('')).toBe('Enter a name.')
    expect(validator('longer')).toBe('Keep the name short.')
    expect(validator('Alex')).toBeUndefined()
  })
})

describe('field-error maps', () => {
  const validators = {
    name: composeValidators(required('Enter a name.'), maxLength(10)),
    note: maxLength(20),
  }

  it('returns an empty object when validation passes', () => {
    expect(validateFields({ name: 'Example', note: '' }, validators)).toEqual({})
  })

  it('returns displayable messages keyed by invalid field', () => {
    expect(validateFields({ name: '', note: 'x'.repeat(21) }, validators)).toEqual({
      name: 'Enter a name.',
      note: 'Use 20 characters or fewer.',
    })
  })

  it('does not mutate submitted values or validator definitions', () => {
    const values = Object.freeze({ name: '  Alex  ', note: '' })
    const rules = Object.freeze({ ...validators })

    expect(validateFields(values, rules)).toEqual({})
    expect(values.name).toBe('  Alex  ')
    expect(Object.keys(rules)).toEqual(['name', 'note'])
  })
})
