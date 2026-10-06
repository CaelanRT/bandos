#!/usr/bin/env bash
# All destructive actions target fresh, randomly named disposable projects only.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${APP_IMAGE:?Build the application image and set APP_IMAGE}"
VERIFY_IMAGE=${VERIFY_IMAGE:-bandos:verification-tools}
umask 077
check_dir=$(mktemp -d)
project="bandos-verify-$(openssl rand -hex 6)"
cleanup() {
  if [[ -f $check_dir/runtime.env && -f $check_dir/override.yaml ]]; then
    "${compose[@]}" unpause db >/dev/null 2>&1 || true
    "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$check_dir"
}
trap cleanup EXIT
mkdir -p "$check_dir/scripts" "$check_dir/certs"
# Copy only the four scripts, never backend/.env or a whole backend directory.
cp backend/test-scripts/*.sh "$check_dir/scripts/"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext 'subjectAltName=DNS:localhost,DNS:edge,IP:127.0.0.1' \
  -keyout "$check_dir/certs/key.pem" -out "$check_dir/certs/cert.pem" 2>/dev/null
cat > "$check_dir/runtime.env" <<ENV
APP_IMAGE=$APP_IMAGE
DB_NAME=bandos_disposable
POSTGRES_PASSWORD=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
CLIENT_ORIGIN=https://localhost:3443
VERIFY_IMAGE=$VERIFY_IMAGE
ENV
cat > "$check_dir/override.yaml" <<YAML
services:
  edge:
    image: $VERIFY_IMAGE
    command: [node, /checks/edge.cjs]
    volumes:
      - $PWD/deploy/verify/edge.cjs:/checks/edge.cjs:ro
      - $check_dir/certs:/certs:ro
    networks: [edge]
    ports: ["127.0.0.1::3443"]
  runner:
    image: $VERIFY_IMAGE
    profiles: [verify]
    entrypoint: [bash]
    environment:
      BASE_URL: https://edge:3443/api/v1
      CLIENT_ORIGIN: \${CLIENT_ORIGIN}
      CURL_CA_BUNDLE: /certs/cert.pem
      NODE_EXTRA_CA_CERTS: /certs/cert.pem
      DB_HOST: db
      DB_PORT: '5432'
      DB_NAME: bandos_disposable
      DB_USERNAME: bandos_admin
      DB_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - $check_dir/scripts:/scripts
      - $check_dir/certs/cert.pem:/certs/cert.pem:ro
      - $PWD/deploy/verify:/checks:ro
      - $check_dir:/state
    networks: [edge, database]
networks:
  edge:
    internal: false
YAML
compose=(docker compose --env-file "$check_dir/runtime.env" -p "$project" -f compose.yaml -f "$check_dir/override.yaml")
run() { "${compose[@]}" run --rm -T runner "$@"; }
start() {
  "${compose[@]}" up -d --wait --wait-timeout 120 db edge
  edge_id=$("${compose[@]}" ps -q edge)
  edge_ip=$(docker inspect "$edge_id" --format "{{(index .NetworkSettings.Networks \"${project}_edge\").IPAddress}}")
  port=$("${compose[@]}" port edge 3443); port=${port##*:}
  # Trust exactly the edge, not the runner or the bridge subnet.
  sed -i '/^TRUST_PROXY=/d; /^CLIENT_ORIGIN=/d' "$check_dir/runtime.env"
  printf 'TRUST_PROXY=%s/32\nCLIENT_ORIGIN=https://localhost:%s\n' "$edge_ip" "$port" >> "$check_dir/runtime.env"
  "${compose[@]}" up -d --wait --wait-timeout 120 app
}
for suite in band event; do
  start
  run -c "bash /scripts/${suite}-smoke-test.sh && bash /scripts/teardown-${suite}-smoke-test.sh"
  "${compose[@]}" down -v
done
start
run /checks/contracts.sh
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 120 app
run /checks/persistence.sh seed
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 120 app
run /checks/persistence.sh check
"${compose[@]}" down
start
run /checks/persistence.sh check
"${compose[@]}" pause db
run /checks/outage.sh
"${compose[@]}" unpause db
# Compose can reject an already-unhealthy dependency before its next probe runs.
# Wait for natural recovery; do not restart the app or database to hide it.
db_id=$("${compose[@]}" ps -q db)
recovered=false
for attempt in {1..120}; do
  if [[ $(docker inspect "$db_id" --format '{{.State.Health.Status}}') == healthy ]]; then
    recovered=true; break
  fi
  sleep 1
done
[[ $recovered == true ]]
"${compose[@]}" up -d --wait --wait-timeout 120
run /checks/persistence.sh check
# Optional host browser check receives only the public origin and test CA path.
if [[ -n ${BROWSER_CHECK:-} ]]; then
  VERIFY_ORIGIN="https://localhost:$port" VERIFY_CA="$check_dir/certs/cert.pem" bash -c "$BROWSER_CHECK"
fi
"${compose[@]}" stop app
app_id=$("${compose[@]}" ps -aq app)
[[ $(docker inspect "$app_id" --format '{{.State.ExitCode}}') == 0 ]]
"${compose[@]}" logs app | rg -q 'Shutdown complete; database pool closed'
docker image inspect "$APP_IMAGE" --format 'Artifact: {{.Id}} {{.Os}}/{{.Architecture}} user={{.Config.User}}'
docker run --rm --entrypoint node "$APP_IMAGE" -e '
const fs=require("fs"),assert=require("assert");
assert.equal(process.getuid(),1000);
for(const path of [".env","test","test-scripts","/app/frontend/node_modules","node_modules/nodemon","/usr/local/bin/npm"])assert(!fs.existsSync(path),path);
const bcrypt=require("bcrypt"); assert(bcrypt.compareSync("check",bcrypt.hashSync("check",12)));
console.log("PASS non-root, runtime scope, no local env, bcrypt");'
echo 'PASS smoke isolation/teardown, HTTPS security/routing, persistence, outage recovery and graceful stop'
