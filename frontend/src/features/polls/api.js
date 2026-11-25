import { check, collection, compositionBody, instant, mutationOptions, nullableId, nullableText, parsePerson, parseSlot, pick, position, requireIds, text, validId } from '../../api/boundary.js'
import { parseEvent } from '../events/api.js'
import { isLaterSameDay, isRealDate, isSupportedTimezone, isTime } from '../events/schedule.js'

export function parsePollId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && validId(Number(value)) ? Number(value) : null
}
export function parsePollSummary(value, status = 200) {
  check(value && validId(value.pollId) && text(value.name) && ['open', 'finalized', 'cancelled'].includes(value.state) &&
    typeof value.hideFromUninvited === 'boolean' && nullableId(value.finalizedEventId) && instant(value.updatedAt), status)
  return pick(value, ['pollId', 'name', 'state', 'hideFromUninvited', 'finalizedEventId', 'updatedAt'])
}
function parseOption(value, status) {
  check(value && validId(value.optionId) && validId(value.revision) && isRealDate(value.date) &&
    isTime(value.startTime) && isTime(value.endTime) && isLaterSameDay(value.startTime, value.endTime) &&
    instant(value.startsAt) && instant(value.endsAt), status)
  return pick(value, ['optionId', 'revision', 'date', 'startTime', 'endTime', 'startsAt', 'endsAt'])
}
function parseAnswer(value, status) {
  check(value && validId(value.optionId) && validId(value.optionRevision) && ['yes', 'no'].includes(value.answer), status)
  return pick(value, ['optionId', 'optionRevision', 'answer'])
}
export function parsePoll(value, status = 200) {
  const summary = parsePollSummary(value, status)
  check(validId(value.bandId) && validId(value.version) && text(value.location) && nullableText(value.description) &&
    isSupportedTimezone(value.timezone) && instant(value.createdAt) &&
    typeof value.canManage === 'boolean' && typeof value.canVote === 'boolean', status)
  const slots = collection(value.slots, slot => ({ ...parseSlot(slot, status),
    musician: slot.musician === null ? null : parsePerson(slot.musician, status) }), 'slotId', status)
  const options = collection(value.options, parseOption, 'optionId', status)
  const responses = collection(value.responses, row => {
    check(row && validId(row.userId) && position(row.voteVersion) && typeof row.needsResponse === 'boolean', status)
    const answers = collection(row.answers, parseAnswer, 'optionId', status)
    check(answers.every(answer => options.some(option => option.optionId === answer.optionId && option.revision === answer.optionRevision)), status)
    return { userId: row.userId, voteVersion: row.voteVersion, needsResponse: row.needsResponse, answers }
  }, 'userId', status)
  return { ...summary, ...pick(value, ['bandId', 'version', 'location', 'description', 'timezone', 'createdAt', 'canManage', 'canVote']),
    slots, options, responses }
}
function pollForBand(value, bandId, pollId, status = 200) {
  const poll = parsePoll(value, status)
  check(poll.bandId === bandId && (pollId === undefined || poll.pollId === pollId), status)
  return poll
}
export async function getPolls(request, bandId, signal) {
  requireIds(bandId)
  const data = await request(`/bands/${bandId}/polls`, { signal, expectedStatus: 200 })
  return collection(data?.polls, parsePollSummary, 'pollId')
}
export async function getPoll(request, bandId, pollId, signal) {
  requireIds(bandId, pollId)
  const data = await request(`/bands/${bandId}/polls/${pollId}`, { signal, expectedStatus: 200 })
  return pollForBand(data?.poll, bandId, pollId)
}
const fields = ['name', 'location', 'description', 'timezone', 'hideFromUninvited']
function pollBody(input, versionField) {
  const body = compositionBody(input, [...fields, versionField])
  if (input.options !== undefined) body.options = input.options.map(option => pick(option, ['optionId', 'clientKey', 'date', 'startTime', 'endTime']))
  return body
}
export async function createPoll(request, bandId, input, signal, options) {
  requireIds(bandId)
  const data = await request(`/bands/${bandId}/polls`, { method: 'POST', body: pollBody(input, 'templateVersion'),
    ...mutationOptions(signal, options), expectedStatus: 201 })
  return pollForBand(data?.poll, bandId, undefined, 201)
}
export async function updatePoll(request, bandId, pollId, input, signal, options) {
  return mutatePoll(request, bandId, pollId, '', 'PATCH', pollBody(input, 'expectedVersion'), signal, options)
}
async function mutatePoll(request, bandId, pollId, path, method, body, signal, options) {
  requireIds(bandId, pollId)
  const data = await request(`/bands/${bandId}/polls/${pollId}${path}`, { method, body,
    ...mutationOptions(signal, options), expectedStatus: 200 })
  return pollForBand(data?.poll, bandId, pollId)
}
export function saveAvailability(request, bandId, pollId, input, signal, options) {
  const body = { ...pick(input, ['expectedVersion', 'expectedVoteVersion']),
    answers: input.answers.map(answer => pick(answer, ['optionId', 'optionRevision', 'answer'])) }
  return mutatePoll(request, bandId, pollId, '/availability', 'PUT', body, signal, options)
}
export function cancelPoll(request, bandId, pollId, input, signal, options) {
  return mutatePoll(request, bandId, pollId, '/cancel', 'POST', pick(input, ['expectedVersion']), signal, options)
}
export async function finalizePoll(request, bandId, pollId, input, signal, options) {
  requireIds(bandId, pollId)
  const data = await request(`/bands/${bandId}/polls/${pollId}/finalize`, { method: 'POST',
    body: pick(input, ['expectedVersion', 'optionId', 'optionRevision']), ...mutationOptions(signal, options), expectedStatus: 200 })
  const poll = pollForBand(data?.poll, bandId, pollId)
  const event = parseEvent(data?.event)
  check(event.bandId === bandId && poll.finalizedEventId === event.eventId)
  return { poll, event }
}
