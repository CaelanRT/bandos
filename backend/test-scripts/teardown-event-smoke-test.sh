#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${PROJECT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_DIR}/.env"
  set +a
fi

if [[ $# -ge 1 ]]; then
  PREFIX="$1"
elif [[ -f "${SCRIPT_DIR}/.last-event-smoke-run" ]]; then
  PREFIX="$(<"${SCRIPT_DIR}/.last-event-smoke-run")"
else
  printf 'Usage: %s <bandos_event_smoke_run_prefix>\n' "$0" >&2
  exit 2
fi

if [[ ! "${PREFIX}" =~ ^bandos_event_smoke_[0-9]{14}_[0-9]+$ ]]; then
  printf 'Refusing teardown: invalid event smoke-test prefix %q\n' "${PREFIX}" >&2
  exit 2
fi

export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"

psql \
  --host="${DB_HOST:?DB_HOST is required}" \
  --port="${DB_PORT:?DB_PORT is required}" \
  --username="${DB_USERNAME:?DB_USERNAME is required}" \
  --dbname="${DB_NAME:?DB_NAME is required}" \
  --set=ON_ERROR_STOP=1 \
  --set="smoke_prefix=${PREFIX}" <<'SQL'
BEGIN;

CREATE TEMP TABLE smoke_user_ids ON COMMIT DROP AS
SELECT user_id
FROM users
WHERE username LIKE :'smoke_prefix' || '\_%' ESCAPE '\';

CREATE TEMP TABLE smoke_band_ids ON COMMIT DROP AS
SELECT DISTINCT ub.band_id
FROM user_bands AS ub
INNER JOIN smoke_user_ids AS su ON su.user_id = ub.user_id;

DELETE FROM events
WHERE band_id IN (SELECT band_id FROM smoke_band_ids)
   OR created_by_user_id IN (SELECT user_id FROM smoke_user_ids);

DELETE FROM "session"
WHERE CASE
  WHEN (sess::jsonb ->> 'userId') ~ '^[0-9]+$'
    THEN (sess::jsonb ->> 'userId')::integer IN (
      SELECT user_id FROM smoke_user_ids
    )
  ELSE false
END;

DELETE FROM user_bands
WHERE band_id IN (SELECT band_id FROM smoke_band_ids)
   OR user_id IN (SELECT user_id FROM smoke_user_ids);

DELETE FROM bands
WHERE band_id IN (SELECT band_id FROM smoke_band_ids);

DELETE FROM users
WHERE user_id IN (SELECT user_id FROM smoke_user_ids);

COMMIT;
SQL

if [[ -f "${SCRIPT_DIR}/.last-event-smoke-run" ]] \
  && [[ "$(<"${SCRIPT_DIR}/.last-event-smoke-run")" == "${PREFIX}" ]]; then
  rm "${SCRIPT_DIR}/.last-event-smoke-run"
fi

printf 'Removed event smoke-test data for prefix: %s\n' "${PREFIX}"
