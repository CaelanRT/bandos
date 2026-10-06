# Reference Compose stack

Run from the repository root with Docker Compose v2+ (verified with v5.5.0).
This is the ticket 05 reference stack, not an AWS production provisioning recipe.
It uses the [combined application image](container-image.md) and the existing
[backend configuration contract](backend/runtime-configuration.md).

## Configuration and first start

Copy `deploy/compose.env.example` to a private path outside the checkout, give it
mode 600, and fill all blank values. Generate three distinct random secrets
(e.g. `openssl rand -hex 32` separately for each). Never commit them or print
`docker compose config` without `--quiet`; rendered configuration and container
inspection can reveal credentials. Keep access to the Docker socket restricted.

```sh
docker build --platform linux/amd64 --pull -t bandos:local .
docker compose --env-file /private/staging.env -p bandos-staging config --quiet
docker compose --env-file /private/staging.env -p bandos-staging up -d --wait --wait-timeout 120
docker compose --env-file /private/staging.env -p bandos-staging ps
```

`APP_IMAGE` selects the already built image; releases use an immutable
`registry/repository@sha256:...` reference. `DB_NAME` maps to both `POSTGRES_DB`
and the API database. `POSTGRES_PASSWORD` belongs only to `bandos_admin`, the
bootstrap administrator in the database container. `DB_PASSWORD` maps to its
`APP_DB_PASSWORD` initialization/probe setting and the API's restricted
`bandos_app` login. The API receives neither administrator name nor password.
`DB_HOST=db`, port 5432 and `DB_SSL=false` apply only to this private network.
The application role cannot create databases, roles, tables or bootstrap
markers; it has table CRUD, sequence USAGE/SELECT, schema USAGE and CONNECT.

The pinned official image is PostgreSQL **17.11-bookworm**, multi-platform index
`sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826`,
resolved 2026-10-06. PostgreSQL 17 uses `/var/lib/postgresql/data` for its named
volume. Review and update the patch tag and digest together; changing a major
version or its mount layout is not a database upgrade. Follow the
[official image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md).

On an empty volume only, the official entrypoint runs `init.sh`: role creation,
existing non-idempotent schema, grants and completion marker commit in one
transaction. TCP health authenticates as the API role, checks that marker and
reads users, bands, user_bands, events and session. The temporary bootstrap
server listens only on a Unix socket and cannot pass this probe. Compose starts
the API only after database health succeeds, using
[service health ordering](https://docs.docker.com/compose/how-tos/startup-order/).
The API never reruns schema.sql. There is no local-data import.

## Private edge and local override

Neither service publishes a host port. PostgreSQL joins only the private,
internal database network. The application also joins the internal
`bandos-staging_edge` network; connect only the controlled TLS proxy there and
proxy to `app:3000`. Configure its public listener and TLS separately, restrict
network membership, overwrite forwarded headers, set `TRUST_PROXY` to its exact
IP(s) and `CLIENT_ORIGIN` to the exact HTTPS public origin. Never forward the
private HTTP readiness exception publicly. Actual AWS edge/storage choices
remain ticket 07 inputs. Do not expose either service with `-P` or a public port.

For deliberately local/disposable HTTP use only, add the explicit override:

```sh
docker compose --env-file /private/disposable.env -p bandos-local \
  -f compose.yaml -f compose.local.yaml up -d --wait
```

This binds only `127.0.0.1:3000`, switches to development and uses
`http://localhost:3000`. The local override makes only the edge bridge non-internal
so Docker can publish its loopback port; the database network stays internal.
If port 3000 is occupied, set `LOCAL_HTTP_PORT` to a free port; the override also sets
CLIENT_ORIGIN to that exact `http://localhost:PORT` origin.
It cannot demonstrate Secure production authentication.
The PostgreSQL service remains private. Production uses only `compose.yaml`.

## Updates and environment isolation

Use separate private env files and project names (`bandos-staging` and
`bandos-production`), database names, passwords, session secrets and origins.
Project-scoped volumes are `bandos-staging_database` and
`bandos-production_database`; never share a volume or credentials. Prefer
separate hosts for real deployments. Keep each environment's SESSION_SECRET
stable across replacements. Promotion changes only production APP_IMAGE to
the accepted staging digest, never copies staging data or secrets.

```sh
# After changing APP_IMAGE in this environment's private file:
docker compose --env-file /private/staging.env -p bandos-staging pull app
docker compose --env-file /private/staging.env -p bandos-staging up -d --wait
# Routine stop/start preserves the named volume:
docker compose --env-file /private/staging.env -p bandos-staging down
docker compose --env-file /private/staging.env -p bandos-staging up -d --wait
```

Do not change DB_NAME/password bootstrap inputs on a populated volume: the
entrypoint does not update stored roles/databases. Plan credential rotation via
administrator SQL and coordinated API configuration separately. Existing or
future schema changes need a tracked migration, not a rerun of schema.sql.
Named volumes preserve container replacements, not disk/instance loss.
Production needs durable EBS retention and tested independent backup/restore
in tickets 07–08 before use.

## Failed bootstrap and explicit staging reset

Inspect `ps` and `logs db` privately. Failed initialization leaves a PGDATA
cluster and is not automatically retried; a missing completion marker keeps
the database unhealthy and prevents initial API startup. Fix the offending
input/script first. Never insert the marker manually to bypass bootstrap.

Only for a **designated disposable stack or staging data explicitly approved
for deletion**, confirm the env file, project name and its volume before:

```sh
# DESTRUCTIVE: deletes ALL data in this designated disposable project.
docker compose --env-file /private/disposable.env -p bandos-disposable down -v
# After correcting the input/script, initialize a new empty volume:
docker compose --env-file /private/disposable.env -p bandos-disposable up -d --wait
```

Never use `down -v` for retained staging/production data. Preserve failed volumes
containing anything to retain, stop traffic, snapshot/backup them and have an
operator perform a reviewed repair/restore. Do not replay the non-idempotent
schema over them. Ordinary `down`/`up` above is volume-safe.

## Operating limits and verification

One API replica per environment is the supported topology. Each container has
1 CPU and 512 MiB memory; PostgreSQL also has 128 MiB shared memory. These are
reference limits, not accepted AWS sizing; monitor usage and test host-specific
limits in ticket 07. Logs go to stdout/stderr via rotating json-file storage
(10 MiB, three files). `unless-stopped` restarts exited processes, **not unhealthy
containers**. Investigate persistent unhealthy state using private health,
logs and database connectivity; a database outage should recover connections
without an API restart loop. Compose ordering gates startup, not ongoing traffic
or automatic shutdown when a dependency later fails.

The API probe is exactly private `GET /api/v1/health`, with a 5-second timeout
covering its fixed 2-second connection + 2-second query bounds. The API has a
fixed 10-second shutdown deadline and 15-second stop grace; PostgreSQL has
30 seconds. Keep stop grace at least five seconds above any future API deadline.
Check exit code 0 and `Shutdown complete; database pool closed` on graceful stop.

```sh
APP_IMAGE=bandos:local bash deploy/test/compose-check.sh
bash -n deploy/postgres/init.sh deploy/postgres/ready.sh deploy/test/compose-check.sh
git diff --check
```

The runner needs Bash, Docker/Compose, Python 3, OpenSSL and ripgrep on the host.
It creates random private temporary configuration, unique disposable projects,
and cleans up only their volumes. It checks fresh schema/grants, table/sequence
CRUD, private ports, limits, container replacement and full down/up persistence,
graceful stop, deliberate schema failure blocking API startup and fresh recovery.
It does not read backend/.env. Full browser/security/product/persistence/outage
evidence belongs to ticket 06. Ticket 05 actual results are recorded in its
[tracking record](product-specs/tickets/containerization/05-compose-database.md).
