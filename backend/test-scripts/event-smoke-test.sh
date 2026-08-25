#!/usr/bin/env bash

set -u

BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_ID="$(date -u +%Y%m%d%H%M%S)_$$"
PREFIX="bandos_event_smoke_${RUN_ID}"
PASSWORD='SmokeTest123!'
WORK_DIR="$(mktemp -d)"
LEADER_COOKIE="${WORK_DIR}/leader.cookies"
MEMBER_COOKIE="${WORK_DIR}/member.cookies"
NEW_MEMBER_COOKIE="${WORK_DIR}/new-member.cookies"
OUTSIDER_COOKIE="${WORK_DIR}/outsider.cookies"
BODY_FILE="${WORK_DIR}/response.json"
STATUS=''
PASSED=0
FAILED=0

cleanup_files() {
  rm -rf "${WORK_DIR}"
}
trap cleanup_files EXIT

pass() {
  PASSED=$((PASSED + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL  %s -- %s\n' "$1" "$2"
  if [[ -s "${BODY_FILE}" ]]; then
    printf '      response: %s\n' "$(tr '\n' ' ' < "${BODY_FILE}")"
  fi
}

request() {
  local method="$1"
  local path="$2"
  local cookie_file="${3:-}"
  local body="${4:-}"
  local args=(-sS -X "${method}" -o "${BODY_FILE}" -w '%{http_code}'
    -H 'Content-Type: application/json')

  if [[ -n "${cookie_file}" ]]; then
    args+=(-b "${cookie_file}" -c "${cookie_file}")
  fi
  if [[ -n "${body}" ]]; then
    args+=(--data "${body}")
  fi

  STATUS="$(curl "${args[@]}" "${BASE_URL}${path}")" || STATUS='000'
}

json_assert() {
  local expression="$1"
  node - "${BODY_FILE}" "${expression}" <<'NODE'
const fs = require('fs');
const [file, expression] = process.argv.slice(2);
try {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  process.exit(Function('json', 'return Boolean(' + expression + ')')(json) ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

json_value() {
  local expression="$1"
  node - "${BODY_FILE}" "${expression}" <<'NODE'
const fs = require('fs');
const [file, expression] = process.argv.slice(2);
try {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const value = Function('json', 'return (' + expression + ')')(json);
  if (value !== undefined && value !== null) process.stdout.write(String(value));
} catch {}
NODE
}

check() {
  local name="$1"
  local expected_status="$2"
  local expression="${3:-true}"

  if [[ "${STATUS}" == "${expected_status}" ]] && json_assert "${expression}"; then
    pass "${name}"
  else
    fail "${name}" "expected HTTP ${expected_status}, received ${STATUS}"
  fi
}

register_user() {
  local username="$1"
  local cookie_file="$2"
  request POST '/auth/register' "${cookie_file}" \
    "{\"username\":\"${username}\",\"firstName\":\"Smoke\",\"lastName\":\"Test\",\"email\":\"${username}@example.test\",\"password\":\"${PASSWORD}\"}"
  [[ "${STATUS}" == '201' ]]
}

future_date() {
  node -e "const d=new Date(); d.setUTCDate(d.getUTCDate()+Number(process.argv[1])); process.stdout.write(d.toISOString().slice(0,10))" "$1"
}

if [[ -f "${PROJECT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_DIR}/.env"
  set +a
fi

printf 'Event API smoke test\n'
printf 'Base URL: %s\n' "${BASE_URL}"
printf 'Run prefix: %s\n\n' "${PREFIX}"

if ! curl -sS --fail --max-time 5 "${BASE_URL}/health" >/dev/null; then
  printf 'ERROR: API is not reachable at %s\n' "${BASE_URL}"
  exit 2
fi

for command in node curl psql; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf 'ERROR: Required command is unavailable: %s\n' "${command}"
    exit 2
  fi
done

LEADER_USERNAME="${PREFIX}_leader"
MEMBER_USERNAME="${PREFIX}_member"
NEW_MEMBER_USERNAME="${PREFIX}_new_member"
OUTSIDER_USERNAME="${PREFIX}_outsider"

if ! register_user "${LEADER_USERNAME}" "${LEADER_COOKIE}"; then
  printf 'ERROR: Could not register leader (HTTP %s): %s\n' "${STATUS}" "$(tr '\n' ' ' < "${BODY_FILE}")"
  exit 2
fi
if ! register_user "${MEMBER_USERNAME}" "${MEMBER_COOKIE}"; then
  printf 'ERROR: Could not register member (HTTP %s): %s\n' "${STATUS}" "$(tr '\n' ' ' < "${BODY_FILE}")"
  exit 2
fi
if ! register_user "${NEW_MEMBER_USERNAME}" "${NEW_MEMBER_COOKIE}"; then
  printf 'ERROR: Could not register new member (HTTP %s): %s\n' "${STATUS}" "$(tr '\n' ' ' < "${BODY_FILE}")"
  exit 2
fi
if ! register_user "${OUTSIDER_USERNAME}" "${OUTSIDER_COOKIE}"; then
  printf 'ERROR: Could not register outsider (HTTP %s): %s\n' "${STATUS}" "$(tr '\n' ' ' < "${BODY_FILE}")"
  exit 2
fi

printf '%s\n' "${PREFIX}" > "${SCRIPT_DIR}/.last-event-smoke-run"

request POST '/bands' "${LEADER_COOKIE}" '{"name":"Event Smoke Band"}'
check 'Create primary band' '201' 'json.data?.band?.currentUserRole === "leader"'
BAND_ID="$(json_value 'json.data?.band?.bandId')"
if [[ ! "${BAND_ID}" =~ ^[1-9][0-9]*$ ]]; then
  printf 'ERROR: Create-band response did not contain a usable bandId\n'
  exit 2
fi

request POST "/bands/${BAND_ID}/members" "${LEADER_COOKIE}" \
  "{\"username\":\"${MEMBER_USERNAME}\"}"
check 'Add existing member before event creation' '201' \
  "json.data?.member?.username === '${MEMBER_USERNAME}'"

request POST '/bands' "${LEADER_COOKIE}" '{"name":"Event Smoke Other Band"}'
check 'Create second band for cross-band isolation' '201'
OTHER_BAND_ID="$(json_value 'json.data?.band?.bandId')"
if [[ ! "${OTHER_BAND_ID}" =~ ^[1-9][0-9]*$ ]]; then
  printf 'ERROR: Second create-band response did not contain a usable bandId\n'
  exit 2
fi

DATE_A="$(future_date 7)"
DATE_B="$(future_date 8)"
DATE_C="$(future_date 9)"
CREATE_A="{\"name\":\"Smoke Rehearsal\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio A\",\"description\":\"Full band rehearsal\"}"
CREATE_B="{\"name\":\"Smoke Performance\",\"type\":\"performance\",\"date\":\"${DATE_B}\",\"startTime\":\"20:00\",\"endTime\":\"22:00\",\"timezone\":\"America/Toronto\",\"location\":\"Main Stage\",\"description\":null}"

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" "${CREATE_A}"
check 'Leader creates complete rehearsal event' '201' \
  "json.data?.event?.bandId === ${BAND_ID} && json.data.event.name === 'Smoke Rehearsal' && json.data.event.type === 'rehearsal' && json.data.event.date === '${DATE_A}' && json.data.event.startTime === '18:00' && json.data.event.endTime === '20:00' && json.data.event.timezone === 'America/Toronto' && json.data.event.location === 'Studio A' && json.data.event.description === 'Full band rehearsal' && json.data.event.isActive === true && Number.isInteger(json.data.event.createdByUserId)"
EVENT_A_ID="$(json_value 'json.data?.event?.eventId')"
EVENT_A_UPDATED_AT="$(json_value 'json.data?.event?.updatedAt')"

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" "${CREATE_B}"
check 'Leader creates performance event' '201' \
  "json.data?.event?.type === 'performance' && json.data.event.description === null"
EVENT_B_ID="$(json_value 'json.data?.event?.eventId')"

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" "${CREATE_B}"
check 'Duplicate event name and schedule are allowed' '201' \
  "json.data?.event?.name === 'Smoke Performance' && json.data.event.eventId !== ${EVENT_B_ID}"
EVENT_DUP_ID="$(json_value 'json.data?.event?.eventId')"

request POST "/bands/${BAND_ID}/events" "${MEMBER_COOKIE}" "${CREATE_A}"
check 'Reject member event creation' '403' 'json.error?.code === "LEADER_REQUIRED"'

request POST "/bands/${BAND_ID}/events" "${OUTSIDER_COOKIE}" "${CREATE_A}"
check 'Hide band from outsider during creation' '404' 'json.error?.code === "BAND_NOT_FOUND"'

request POST "/bands/${BAND_ID}/events" '' "${CREATE_A}"
check 'Reject unauthenticated event creation' '401' 'json.error?.code === "AUTHENTICATION_REQUIRED"'

request GET "/bands/${BAND_ID}/events" "${LEADER_COOKIE}"
check 'Leader lists complete events in schedule order' '200' \
  "Array.isArray(json.data?.events) && json.data.events.length === 3 && json.data.events[0].eventId === ${EVENT_A_ID} && json.data.events[1].eventId === ${EVENT_B_ID} && json.data.events[2].eventId === ${EVENT_DUP_ID} && json.data.events.every(e => ['eventId','bandId','name','type','date','startTime','endTime','timezone','location','description','createdByUserId','isActive','createdAt','updatedAt'].every(k => k in e))"

request GET "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${MEMBER_COOKIE}"
check 'Existing member retrieves complete event' '200' \
  "json.data?.event?.eventId === ${EVENT_A_ID} && json.data.event.bandId === ${BAND_ID} && json.data.event.name === 'Smoke Rehearsal'"

request POST "/bands/${BAND_ID}/members" "${LEADER_COOKIE}" \
  "{\"username\":\"${NEW_MEMBER_USERNAME}\"}"
check 'Add member after event creation' '201' \
  "json.data?.member?.username === '${NEW_MEMBER_USERNAME}'"

request GET "/bands/${BAND_ID}/events" "${NEW_MEMBER_COOKIE}"
check 'New member immediately sees existing events' '200' \
  "json.data?.events?.some(e => e.eventId === ${EVENT_A_ID}) && json.data.events.some(e => e.eventId === ${EVENT_B_ID})"

request GET "/bands/${BAND_ID}/events" "${OUTSIDER_COOKIE}"
check 'Hide event collection from outsider' '404' 'json.error?.code === "BAND_NOT_FOUND"'

request GET "/bands/${BAND_ID}/events/999999999" "${LEADER_COOKIE}"
check 'Unknown event in accessible band is not found' '404' 'json.error?.code === "EVENT_NOT_FOUND"'

request GET "/bands/${OTHER_BAND_ID}/events/${EVENT_A_ID}" "${LEADER_COOKIE}"
check 'Cross-band event ID is not found' '404' 'json.error?.code === "EVENT_NOT_FOUND"'

request GET "/bands/abc/events/${EVENT_A_ID}" "${LEADER_COOKIE}"
check 'Reject malformed band ID before event lookup' '400' 'json.error?.code === "VALIDATION_ERROR"'

request GET "/bands/${BAND_ID}/events/abc" "${LEADER_COOKIE}"
check 'Reject malformed event ID' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Bad Extra\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\",\"owner\":5}"
check 'Reject unknown create properties' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\"}"
check 'Reject empty event name' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Bad Type\",\"type\":\"meeting\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\"}"
check 'Reject invalid event type' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  '{"name":"Bad Date","type":"rehearsal","date":"2027-02-29","startTime":"18:00","endTime":"20:00","timezone":"America/Toronto","location":"Studio"}'
check 'Reject impossible calendar date' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Bad Time\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"6:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\"}"
check 'Reject non-HH:mm time' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Bad Zone\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"Mars/Olympus\",\"location\":\"Studio\"}"
check 'Reject invalid IANA timezone' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Same Time\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"18:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\"}"
check 'Reject equal start and end times' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Reverse Time\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"20:00\",\"endTime\":\"18:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\"}"
check 'Reject reversed event times' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  '{"name":"Past Event","type":"rehearsal","date":"2000-01-01","startTime":"18:00","endTime":"20:00","timezone":"America/Toronto","location":"Studio"}'
check 'Reject non-future event creation' '400' 'json.error?.code === "VALIDATION_ERROR"'

LONG_NAME="$(node -e "process.stdout.write('n'.repeat(101))")"
request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"${LONG_NAME}\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\"}"
check 'Reject event name over 100 characters' '400' 'json.error?.code === "VALIDATION_ERROR"'

LONG_LOCATION="$(node -e "process.stdout.write('l'.repeat(256))")"
request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Long Location\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"${LONG_LOCATION}\"}"
check 'Reject location over 255 characters' '400' 'json.error?.code === "VALIDATION_ERROR"'

LONG_DESCRIPTION="$(node -e "process.stdout.write('d'.repeat(2001))")"
request POST "/bands/${BAND_ID}/events" "${LEADER_COOKIE}" \
  "{\"name\":\"Long Description\",\"type\":\"rehearsal\",\"date\":\"${DATE_A}\",\"startTime\":\"18:00\",\"endTime\":\"20:00\",\"timezone\":\"America/Toronto\",\"location\":\"Studio\",\"description\":\"${LONG_DESCRIPTION}\"}"
check 'Reject description over 2000 characters' '400' 'json.error?.code === "VALIDATION_ERROR"'

PATCH_BODY="{\"name\":\"Updated Performance\",\"type\":\"performance\",\"date\":\"${DATE_C}\",\"startTime\":\"19:15\",\"endTime\":\"21:30\",\"timezone\":\"UTC\",\"location\":\"Updated Hall\",\"description\":\"\"}"
request PATCH "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${LEADER_COOKIE}" "${PATCH_BODY}"
check 'Leader patches every editable field' '200' \
  "json.data?.event?.eventId === ${EVENT_A_ID} && json.data.event.name === 'Updated Performance' && json.data.event.type === 'performance' && json.data.event.date === '${DATE_C}' && json.data.event.startTime === '19:15' && json.data.event.endTime === '21:30' && json.data.event.timezone === 'UTC' && json.data.event.location === 'Updated Hall' && json.data.event.description === null && json.data.event.updatedAt !== '${EVENT_A_UPDATED_AT}'"

request PATCH "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${MEMBER_COOKIE}" '{"name":"Forbidden"}'
check 'Reject member event edit' '403' 'json.error?.code === "LEADER_REQUIRED"'

request PATCH "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${OUTSIDER_COOKIE}" '{"name":"Hidden"}'
check 'Hide event during outsider edit' '404' 'json.error?.code === "BAND_NOT_FOUND"'

request PATCH "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${LEADER_COOKIE}" '{}'
check 'Reject empty event patch' '400' 'json.error?.code === "VALIDATION_ERROR"'

request PATCH "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${LEADER_COOKIE}" '{"unknown":true}'
check 'Reject unknown patch property' '400' 'json.error?.code === "VALIDATION_ERROR"'

request PATCH "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${LEADER_COOKIE}" '{"date":"2000-01-01"}'
check 'Reject patch that moves event into past' '400' 'json.error?.code === "VALIDATION_ERROR"'

request GET "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${LEADER_COOKIE}"
check 'Failed patch rolls back and preserves event' '200' \
  "json.data?.event?.date === '${DATE_C}' && json.data.event.name === 'Updated Performance'"

export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD is required for started-event verification}"
psql \
  --host="${DB_HOST:?DB_HOST is required for started-event verification}" \
  --port="${DB_PORT:?DB_PORT is required for started-event verification}" \
  --username="${DB_USERNAME:?DB_USERNAME is required for started-event verification}" \
  --dbname="${DB_NAME:?DB_NAME is required for started-event verification}" \
  --set=ON_ERROR_STOP=1 \
  --set="event_id=${EVENT_B_ID}" \
  --set="band_id=${BAND_ID}" <<'SQL' >/dev/null
UPDATE events
SET event_date = CURRENT_DATE - 1,
    start_time = '12:00',
    end_time = '13:00',
    timezone = 'UTC'
WHERE event_id = :'event_id'::integer
  AND band_id = :'band_id'::integer
  AND is_active = true;
SQL

request PATCH "/bands/${BAND_ID}/events/${EVENT_B_ID}" "${LEADER_COOKIE}" \
  "{\"date\":\"${DATE_C}\"}"
check 'Started event cannot be moved back into future' '409' \
  'json.error?.code === "EVENT_ALREADY_STARTED"'

request GET "/bands/${BAND_ID}/events" "${LEADER_COOKIE}"
check 'Historical events sort after upcoming events' '200' \
  "json.data?.events?.at(-1)?.eventId === ${EVENT_B_ID}"

request DELETE "/bands/${BAND_ID}/events/${EVENT_B_ID}" "${MEMBER_COOKIE}"
check 'Reject member event deletion' '403' 'json.error?.code === "LEADER_REQUIRED"'

request DELETE "/bands/${BAND_ID}/events/${EVENT_B_ID}" "${OUTSIDER_COOKIE}"
check 'Hide event during outsider deletion' '404' 'json.error?.code === "BAND_NOT_FOUND"'

request DELETE "/bands/${BAND_ID}/events/${EVENT_B_ID}" "${LEADER_COOKIE}"
check 'Leader can delete a started event' '200' 'json.data?.message === "Event deleted"'

request GET "/bands/${BAND_ID}/events/${EVENT_B_ID}" "${LEADER_COOKIE}"
check 'Soft-deleted event direct read is not found' '404' 'json.error?.code === "EVENT_NOT_FOUND"'

request DELETE "/bands/${BAND_ID}/events/${EVENT_B_ID}" "${LEADER_COOKIE}"
check 'Repeated event deletion is not found' '404' 'json.error?.code === "EVENT_NOT_FOUND"'

request GET "/bands/${BAND_ID}/events" "${LEADER_COOKIE}"
check 'Soft-deleted event disappears from list' '200' \
  "!json.data?.events?.some(e => e.eventId === ${EVENT_B_ID})"

request DELETE "/bands/${BAND_ID}" "${LEADER_COOKIE}"
check 'Soft-delete band with remaining events' '200' 'json.data?.message === "Band deleted"'

request GET "/bands/${BAND_ID}/events" "${LEADER_COOKIE}"
check 'Inactive band hides remaining events from leader' '404' 'json.error?.code === "BAND_NOT_FOUND"'

request GET "/bands/${BAND_ID}/events/${EVENT_A_ID}" "${NEW_MEMBER_COOKIE}"
check 'Inactive band hides remaining events from member' '404' 'json.error?.code === "BAND_NOT_FOUND"'

printf '\nResult: %d passed, %d failed\n' "${PASSED}" "${FAILED}"
printf 'Teardown command: %s/teardown-event-smoke-test.sh %s\n' "${SCRIPT_DIR}" "${PREFIX}"

if (( FAILED > 0 )); then
  exit 1
fi
