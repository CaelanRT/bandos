import { invalidApiResponse } from './errors.js'

export const validId = value => Number.isSafeInteger(value) && value > 0
export const nullableId = value => value === null || validId(value)
export const text = value => typeof value === 'string' && value.trim().length > 0
export const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(value) && Number.isFinite(Date.parse(value))
export const nullableText = value => value === null || typeof value === 'string'
export const position = value => Number.isSafeInteger(value) && value >= 0
export function check(condition, status = 200) {
  if (!condition) throw invalidApiResponse(status)
}
export function requireIds(...ids) { check(ids.every(validId)) }
export function pick(value, fields) {
  return Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
}
export function collection(value, parse, key, status = 200) {
  check(Array.isArray(value), status)
  const rows = value.map(row => parse(row, status))
  check(new Set(rows.map(row => row[key])).size === rows.length, status)
  return rows
}
export function parsePerson(value, status = 200) {
  check(value && validId(value.userId) && ['username', 'firstName', 'lastName'].every(key => text(value[key])), status)
  return pick(value, ['userId', 'username', 'firstName', 'lastName'])
}
export function parseSlot(value, status = 200) {
  check(value && validId(value.slotId) && nullableId(value.templateSlotId) && validId(value.instrumentId) &&
    text(value.instrumentName) && text(value.label) && position(value.position), status)
  return pick(value, ['slotId', 'templateSlotId', 'instrumentId', 'instrumentName', 'label', 'position'])
}
// Read-only snapshots and invitation identities must never leak into composition writes.
export function writeSlots(slots) {
  return slots.map(slot => pick(slot, ['slotId', 'clientKey', 'templateSlotId', 'instrumentId', 'label', 'userId']))
}
export function compositionBody(value, fields) {
  const body = pick(value, fields)
  if (value.slots !== undefined) body.slots = writeSlots(value.slots)
  return body
}
export function mutationOptions(signal, { idempotencyKey } = {}) {
  return { signal, ...(idempotencyKey === undefined ? {} : { headers: { 'Idempotency-Key': idempotencyKey } }) }
}
export function message(data, expected, status = 200) {
  check(data?.message === expected, status)
  return data.message
}
