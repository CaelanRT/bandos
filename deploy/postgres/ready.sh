#!/usr/bin/env bash
set -euo pipefail
# TCP excludes the temporary socket-only server used during initialization.
# Authenticate as the API role and check the committed gate, not just SELECT 1.
export PGPASSWORD="$APP_DB_PASSWORD" PGCONNECT_TIMEOUT=2 PGOPTIONS='-c statement_timeout=2000'
result=$(psql --host 127.0.0.1 --username bandos_app --dbname "$POSTGRES_DB" \
  --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 <<'SQL'
SELECT 1 FROM bandos_bootstrap.completed WHERE version = 1;
SELECT user_id FROM public.users LIMIT 0;
SELECT band_id FROM public.bands LIMIT 0;
SELECT user_bands_id FROM public.user_bands LIMIT 0;
SELECT event_id FROM public.events LIMIT 0;
SELECT sid FROM public.session LIMIT 0;
SQL
)
[[ "$result" == 1 ]]
