#!/usr/bin/env bash

set -u

BASE_URL="${BASE_URL:-http://localhost:3001/api/v1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_ID="$(date -u +%Y%m%d%H%M%S)_$$"
PREFIX="bandos_smoke_${RUN_ID}"
PASSWORD='SmokeTest123!'
WORK_DIR="$(mktemp -d)"
LEADER_COOKIE="${WORK_DIR}/leader.cookies"
MEMBER_COOKIE="${WORK_DIR}/member.cookies"
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
  process.exit(Function('json', `return Boolean(${expression})`)(json) ? 0 : 1);
} catch {
  process.exit(1);
}
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
  local email="$2"
  local cookie_file="$3"
  request POST '/auth/register' "${cookie_file}" \
    "{\"username\":\"${username}\",\"firstName\":\"Smoke\",\"lastName\":\"Test\",\"email\":\"${email}\",\"password\":\"${PASSWORD}\"}"
  [[ "${STATUS}" == '201' ]]
}

printf 'Band API smoke test\n'
printf 'Base URL: %s\n' "${BASE_URL}"
printf 'Run prefix: %s\n\n' "${PREFIX}"

if ! curl -sS --fail --max-time 5 "${BASE_URL}/health" >/dev/null; then
  printf 'ERROR: API is not reachable at %s\n' "${BASE_URL}"
  exit 2
fi

LEADER_USERNAME="${PREFIX}_leader"
MEMBER_USERNAME="${PREFIX}_member"
OUTSIDER_USERNAME="${PREFIX}_outsider"

if ! register_user "${LEADER_USERNAME}" "${LEADER_USERNAME}@example.test" "${LEADER_COOKIE}"; then
  printf 'ERROR: Could not register leader (HTTP %s): %s\n' "${STATUS}" "$(tr '\n' ' ' < "${BODY_FILE}")"
  exit 2
fi
if ! register_user "${MEMBER_USERNAME}" "${MEMBER_USERNAME}@example.test" "${MEMBER_COOKIE}"; then
  printf 'ERROR: Could not register member (HTTP %s): %s\n' "${STATUS}" "$(tr '\n' ' ' < "${BODY_FILE}")"
  exit 2
fi
if ! register_user "${OUTSIDER_USERNAME}" "${OUTSIDER_USERNAME}@example.test" "${OUTSIDER_COOKIE}"; then
  printf 'ERROR: Could not register outsider (HTTP %s): %s\n' "${STATUS}" "$(tr '\n' ' ' < "${BODY_FILE}")"
  exit 2
fi

printf '%s\n' "${PREFIX}" > "${SCRIPT_DIR}/.last-band-smoke-run"

request POST '/bands' "${LEADER_COOKIE}" '{"name":"Smoke Test Band"}'
check 'Create band and assign creator as leader' '201' \
  'json.data?.band?.name === "Smoke Test Band" && json.data.band.currentUserRole === "leader" && json.data.band.members?.[0]?.role === "leader"'
BAND_ID="$(node -e "try{const j=require(process.argv[1]);process.stdout.write(String(j.data.band.bandId))}catch{}" "${BODY_FILE}")"
if [[ ! "${BAND_ID}" =~ ^[1-9][0-9]*$ ]]; then
  printf 'ERROR: Create-band response did not contain a usable bandId\n'
  exit 2
fi

request GET '/bands' "${LEADER_COOKIE}"
check 'List bands as leader (lightweight summary)' '200' \
  "json.data?.bands?.some(b => b.bandId === ${BAND_ID} && b.currentUserRole === 'leader' && !('members' in b))"

request GET "/bands/${BAND_ID}" "${LEADER_COOKIE}"
check 'Get band as leader with members' '200' \
  "json.data?.band?.bandId === ${BAND_ID} && Array.isArray(json.data.band.members)"

request POST "/bands/${BAND_ID}/members" "${LEADER_COOKIE}" \
  "{\"username\":\"${MEMBER_USERNAME}\"}"
check 'Add active user as member' '201' \
  "json.data?.member?.username === '${MEMBER_USERNAME}' && json.data.member.role === 'member'"

MEMBER_USERNAME_UPPER="$(printf '%s' "${MEMBER_USERNAME}" | tr '[:lower:]' '[:upper:]')"
request POST "/bands/${BAND_ID}/members" "${LEADER_COOKIE}" \
  "{\"username\":\"${MEMBER_USERNAME_UPPER}\"}"
check 'Case-insensitive duplicate username lookup' '409' \
  'json.error?.code === "USER_ALREADY_IN_BAND"'

request POST "/bands/${BAND_ID}/members" "${LEADER_COOKIE}" \
  "{\"username\":\"${PREFIX}_missing\"}"
check 'Reject unknown username' '404' 'json.error?.code === "USER_NOT_FOUND"'

request GET '/bands' "${MEMBER_COOKIE}"
check 'List joined bands as member' '200' \
  "json.data?.bands?.some(b => b.bandId === ${BAND_ID} && b.currentUserRole === 'member')"

request GET "/bands/${BAND_ID}" "${MEMBER_COOKIE}"
check 'Get band as member and see member list' '200' \
  "json.data?.band?.members?.length === 2 && json.data.band.members.every(m => !('email' in m))"

request PATCH "/bands/${BAND_ID}" "${LEADER_COOKIE}" '{"name":"Updated Smoke Band"}'
check 'Update band as leader' '200' 'json.data?.band?.name === "Updated Smoke Band"'

request PATCH "/bands/${BAND_ID}" "${MEMBER_COOKIE}" '{"name":"Forbidden Update"}'
check 'Reject member band update' '403' 'json.error?.code === "LEADER_REQUIRED"'

request POST "/bands/${BAND_ID}/members" "${MEMBER_COOKIE}" \
  "{\"username\":\"${OUTSIDER_USERNAME}\"}"
check 'Reject member adding another user' '403' 'json.error?.code === "LEADER_REQUIRED"'

request GET "/bands/${BAND_ID}" "${OUTSIDER_COOKIE}"
check 'Hide band from outsider' '404' 'json.error?.code === "BAND_NOT_FOUND"'

request GET '/bands/abc' "${LEADER_COOKIE}"
check 'Reject invalid band ID' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST '/bands' "${LEADER_COOKIE}" '{"name":""}'
check 'Reject empty band name' '400' 'json.error?.code === "VALIDATION_ERROR"'

request POST '/bands' "${LEADER_COOKIE}" '{"name":"Extra Property Band","owner":5}'
check 'Reject unknown body properties' '400' 'json.error?.code === "VALIDATION_ERROR"'

request GET '/bands'
check 'Reject unauthenticated band access' '401' 'json.error?.code === "AUTHENTICATION_REQUIRED"'

request DELETE "/bands/${BAND_ID}" "${MEMBER_COOKIE}"
check 'Reject member band deletion' '403' 'json.error?.code === "LEADER_REQUIRED"'

request DELETE "/bands/${BAND_ID}" "${LEADER_COOKIE}"
check 'Soft-delete band as leader' '200' 'json.data?.message === "Band deleted"'

request GET "/bands/${BAND_ID}" "${LEADER_COOKIE}"
check 'Deleted band is inaccessible' '404' 'json.error?.code === "BAND_NOT_FOUND"'

request GET '/bands' "${MEMBER_COOKIE}"
check 'Deleted band disappears from member list' '200' \
  "Array.isArray(json.data?.bands) && !json.data.bands.some(b => b.bandId === ${BAND_ID})"

printf '\nResult: %d passed, %d failed\n' "${PASSED}" "${FAILED}"
printf 'Teardown command: %s/teardown-band-smoke-test.sh %s\n' "${SCRIPT_DIR}" "${PREFIX}"

if (( FAILED > 0 )); then
  exit 1
fi

