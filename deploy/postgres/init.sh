#!/usr/bin/env bash
set -euo pipefail
# Executed only by the official entrypoint on an empty PGDATA directory.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --set=app_password="$APP_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
BEGIN;
CREATE ROLE bandos_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO bandos_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO bandos_app;
\i /opt/bandos/schema.sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bandos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bandos_app;
CREATE SCHEMA bandos_bootstrap;
CREATE TABLE bandos_bootstrap.completed (version integer PRIMARY KEY CHECK (version = 1));
INSERT INTO bandos_bootstrap.completed VALUES (1);
GRANT USAGE ON SCHEMA bandos_bootstrap TO bandos_app;
GRANT SELECT ON bandos_bootstrap.completed TO bandos_app;
COMMIT;
SQL
