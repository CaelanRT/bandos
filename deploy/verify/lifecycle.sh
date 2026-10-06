#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../backend"
# Existing test suite requires this exact dedicated disposable fixture name.
if docker container inspect bandos-readiness-test >/dev/null 2>&1; then
  echo 'Dedicated readiness fixture name already exists; preserving it' >&2; exit 1
fi
cleanup() {
  docker unpause bandos-readiness-test >/dev/null 2>&1 || true
  docker rm -f bandos-readiness-test >/dev/null
}
export DB_PASSWORD=$(openssl rand -hex 32)
fixture_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
docker run -d --name bandos-readiness-test -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=bandos_readiness -p "127.0.0.1:$fixture_port:5432" postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826 >/dev/null
trap cleanup EXIT
for i in {1..60}; do
 if docker exec bandos-readiness-test pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec -i bandos-readiness-test psql -U postgres -d bandos_readiness -v ON_ERROR_STOP=1 < db/schemas/schema.sql >/dev/null
export DB_HOST=127.0.0.1 DB_PORT=$(docker port bandos-readiness-test 5432 | sed 's/.*://') DB_USERNAME=postgres DB_NAME=bandos_readiness TEST_PG_CONTAINER=bandos-readiness-test
node --test test/readiness-shutdown.integration.test.js
