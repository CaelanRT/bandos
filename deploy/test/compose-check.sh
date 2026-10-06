#!/usr/bin/env bash
# This runner creates and destroys only its own disposable projects/volumes.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${APP_IMAGE:?Build the application image and set APP_IMAGE}"
check_dir=$(mktemp -d)
project="bandos-compose-check-$$"
failed_project="${project}-failed"
cleanup() {
  docker compose --env-file "$check_dir/runtime.env" -p "$project" -f compose.yaml down -v >/dev/null 2>&1 || true
  docker compose --env-file "$check_dir/runtime.env" -p "$failed_project" -f compose.yaml -f "$check_dir/failure.yaml" down -v >/dev/null 2>&1 || true
  rm -rf "$check_dir"
}
trap cleanup EXIT
umask 077
cat > "$check_dir/runtime.env" <<ENV
APP_IMAGE=$APP_IMAGE
DB_NAME=bandos_disposable
POSTGRES_PASSWORD=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
CLIENT_ORIGIN=https://compose-check.example.invalid
ENV
compose=(docker compose --env-file "$check_dir/runtime.env" -p "$project" -f compose.yaml)
"${compose[@]}" config --quiet
# Validate the explicit local override without emitting rendered credentials.
docker compose --env-file "$check_dir/runtime.env" -p "$project" -f compose.yaml -f compose.local.yaml config --format json |
  python3 -c 'import json,sys; c=json.load(sys.stdin); assert c["services"]["app"]["ports"][0]["host_ip"]=="127.0.0.1"; assert c["services"]["app"]["environment"]["NODE_ENV"]=="development"; assert c["networks"]["database"]["internal"]; assert not c["networks"]["edge"].get("internal",False)'
"${compose[@]}" up -d --wait --wait-timeout 120
sql=("${compose[@]}" exec -T db bash -c 'PGPASSWORD="$APP_DB_PASSWORD" psql -h 127.0.0.1 -U bandos_app -d "$POSTGRES_DB" -XAt -v ON_ERROR_STOP=1')
[[ $("${sql[@]}" <<< "SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user;") == t ]]
[[ $("${sql[@]}" <<< "SELECT NOT has_schema_privilege(current_user, 'public', 'CREATE');") == t ]]
"${sql[@]}" <<'SQL'
INSERT INTO users (username,first_name,last_name,email,password_hash) VALUES ('compose_check','Compose','Check','compose@example.invalid','test-only');
INSERT INTO bands (name) VALUES ('Compose persistence');
INSERT INTO user_bands (role,user_id,band_id) VALUES ('leader',1,1);
INSERT INTO events (band_id,created_by_user_id,name,type,event_date,start_time,end_time,timezone,location) VALUES (1,1,'Check','rehearsal','2026-10-07','10:00','11:00','Europe/London','Test');
INSERT INTO session (sid,sess,expire) VALUES ('compose-check','{}',NOW()+interval '1 day');
UPDATE bands SET name='Preserved band' WHERE band_id=1;
DELETE FROM session WHERE sid='compose-check';
SQL
schema_oid=$("${sql[@]}" <<< "SELECT 'public.users'::regclass::oid;")
app_id=$("${compose[@]}" ps -q app)
db_id=$("${compose[@]}" ps -q db)
docker inspect "$app_id" "$db_id" |
  python3 -c 'import json,sys; a,d=json.load(sys.stdin); assert not a["HostConfig"]["PortBindings"]; assert not d["HostConfig"]["PortBindings"]; assert a["Config"]["User"]=="node"; assert a["HostConfig"]["Memory"]==536870912; assert a["Config"]["StopTimeout"]==15; assert not any(x.startswith("POSTGRES_") for x in a["Config"]["Env"])'
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 120
[[ $("${sql[@]}" <<< "SELECT 'public.users'::regclass::oid;") == "$schema_oid" ]]
[[ $("${sql[@]}" <<< "SELECT name FROM bands WHERE band_id=1;") == 'Preserved band' ]]
"${compose[@]}" down
"${compose[@]}" up -d --wait --wait-timeout 120
[[ $("${sql[@]}" <<< "SELECT 'public.users'::regclass::oid;") == "$schema_oid" ]]
[[ $("${sql[@]}" <<< "SELECT count(*) FROM user_bands;") == 1 ]]
[[ $("${sql[@]}" <<< "SELECT count(*) FROM events;") == 1 ]]
"${compose[@]}" stop app
app_id=$("${compose[@]}" ps -aq app)
[[ $(docker inspect "$app_id" --format '{{.State.ExitCode}}') == 0 ]]
"${compose[@]}" logs app | rg -q 'Shutdown complete; database pool closed'
# Deliberately fail after the non-idempotent schema; the transaction must roll back.
cat backend/db/schemas/schema.sql > "$check_dir/broken.sql"
printf '\nSELECT deliberately_missing_bootstrap_function();\n' >> "$check_dir/broken.sql"
# The official entrypoint runs as postgres and must read this disposable fixture.
chmod 755 "$check_dir"
chmod 644 "$check_dir/broken.sql"
cat > "$check_dir/failure.yaml" <<YAML
services:
  db:
    volumes:
      - $check_dir/broken.sql:/opt/bandos/schema.sql:ro
    healthcheck:
      interval: 1s
      retries: 2
      start_period: 0s
YAML
failed=(docker compose --env-file "$check_dir/runtime.env" -p "$failed_project" -f compose.yaml -f "$check_dir/failure.yaml")
if "${failed[@]}" up -d --wait --wait-timeout 30; then
  echo 'Failed initialization unexpectedly opened the stack' >&2
  exit 1
fi
failed_app=$("${failed[@]}" ps -aq app)
[[ $(docker inspect "$failed_app" --format '{{.State.Status}}') == created ]]
"${failed[@]}" logs db | rg -q 'deliberately_missing_bootstrap_function'
# Follow the documented disposable recovery: delete only this failed project's volume.
"${failed[@]}" down -v
docker compose --env-file "$check_dir/runtime.env" -p "$failed_project" -f compose.yaml up -d --wait --wait-timeout 120
echo 'PASS: fresh schema, restricted grants, private ports, replacement, persistence, graceful stop, failed bootstrap gate and disposable recovery'
