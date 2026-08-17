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
elif [[ -f "${SCRIPT_DIR}/.last-band-smoke-run" ]]; then
  PREFIX="$(<"${SCRIPT_DIR}/.last-band-smoke-run")"
else
  printf 'Usage: %s <bandos_smoke_run_prefix>\n' "$0" >&2
  exit 2
fi

if [[ ! "${PREFIX}" =~ ^bandos_smoke_[0-9]{14}_[0-9]+$ ]]; then
  printf 'Refusing teardown: invalid smoke-test prefix %q\n' "${PREFIX}" >&2
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

CREATE TEMP TABLE smoke_band_ids ON COMMIT DROP AS
SELECT DISTINCT ub.band_id
FROM user_bands AS ub
INNER JOIN users AS u ON u.user_id = ub.user_id
WHERE u.username LIKE :'smoke_prefix' || '\_%' ESCAPE '\';

DELETE FROM "session"
WHERE (sess::jsonb ->> 'userId')::integer IN (
  SELECT user_id
  FROM users
  WHERE username LIKE :'smoke_prefix' || '\_%' ESCAPE '\'
);

DELETE FROM user_bands
WHERE band_id IN (SELECT band_id FROM smoke_band_ids)
OR user_id IN (
  SELECT user_id
  FROM users
  WHERE username LIKE :'smoke_prefix' || '\_%' ESCAPE '\'
);

DELETE FROM bands
WHERE band_id IN (SELECT band_id FROM smoke_band_ids);

DELETE FROM users
WHERE username LIKE :'smoke_prefix' || '\_%' ESCAPE '\';

COMMIT;
SQL

if [[ -f "${SCRIPT_DIR}/.last-band-smoke-run" ]] \
  && [[ "$(<"${SCRIPT_DIR}/.last-band-smoke-run")" == "${PREFIX}" ]]; then
  rm "${SCRIPT_DIR}/.last-band-smoke-run"
fi

printf 'Removed smoke-test data for prefix: %s\n' "${PREFIX}"
