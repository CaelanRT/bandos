# Orchestrate the application and fresh persistent PostgreSQL with Compose

> **Status:** For Review — [Draft PR #67](https://github.com/CaelanRT/bandos/pull/67)

> **Dependencies:** [04 — Application image](04-application-image.md).

## Objective

Provide a reference Compose stack that initializes a fresh database once, starts the application only after schema readiness, and preserves data on ordinary updates.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 3, 4, 5 (fresh/reference and staging/production database lifecycle), 6 candidate 4, and 7 criteria 2, 6–7. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

The existing schema creates non-idempotent enums/tables, including session; session auto-creation is disabled. A successful SELECT 1 alone cannot prove schema completion.

## Scope

- Add Compose networking, pinned PostgreSQL image, persistent named volume, bootstrap role/grants, readiness/schema gates, and secret-free configuration examples.
- Document configuration mapping, fresh staging start, volume-safe updates, explicit staging reset, and partial initialization recovery.
- Configure one application replica, restart policy, bounded stop grace, stdout/stderr logging, and documented resource limits.

## Out of Scope

- AWS resources/TLS ownership selection, registry/Actions, local data import, general migration framework, and acceptance of production durability from a named volume alone.
- Integrated browser/smoke/persistence evidence belongs to 06; no duplication of its full flow matrix.

## Acceptance Criteria

- [x] From an empty volume, Compose initializes users, bands, user_bands, events, and session before starting the API; failed or partial initialization does not open traffic and has an actionable recovery procedure.
- [x] The backend uses the private database service name and a restricted non-superuser application role with required table/sequence/session permissions; bootstrap administration credentials are not passed to the API.
- [x] Selected PostgreSQL version and volume mount match official-image instructions; the non-idempotent schema runs only on first initialization, never on each API startup.
- [x] Ordinary replacement/down/up preserves the database volume. Destructive down -v/reset is clearly limited to designated disposable or staging data; no local-data import occurs.
- [x] Staging/production configuration, credentials, database/volume identities, and SESSION_SECRET are separate; promotion changes the app image reference and never copies staging data.
- [x] PostgreSQL is private and the application port is reachable only from a trusted edge/private network; any local HTTP override is explicit and bound to loopback.
- [x] Compose uses the exact private readiness probe, schema completion gate, stop grace compatible with 02, restart policy, and documented resource limits. Documentation explains that unhealthy status alone is not a restart mechanism.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Validate rendered Compose configuration without leaking secrets; boot fresh, verify schema/role grants and application start gating, and demonstrate failed bootstrap blocking startup. Recreate containers on the same volume and verify schema is not reapplied.

### Manual / Smoke Verification

- Follow fresh bootstrap, volume-preserving stop/start, and disposable partial-bootstrap recovery instructions. Inspect private port bindings and configured stop/resource limits.

### Explicitly Not Required

- General schema migrations, PostgreSQL major-version upgrades, or distributed replicas.

## Implementation Notes

- Code: [schema.sql](../../../backend/db/schemas/schema.sql), [db/index.js](../../../backend/db/index.js), [health.controller.js](../../../backend/controllers/health.controller.js), plus Dockerfile/configuration from 01–04.
- POSTGRES_* bootstrap settings and DB_* runtime settings are distinct. Version, mount path, and reference resource values are implementation selections to document; actual AWS sizing/TLS/network inputs belong to 07. Production remains blocked on durable storage and recovery in 07–08.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [x] Existing relevant tests pass; no known regression exists in touched behavior.
- [x] Run frontend `npm test`, `npm run lint`, and `npm run build`; run relevant focused backend checks, Docker/Compose checks described above, `bash -n` on changed shell scripts, and `git diff --check`. Use clean lockfile installs and disposable databases.
- [x] No unnecessary out-of-scope work is introduced.
- [x] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Ticket 06 supplies full stack evidence; 07–08 adapt deployment/recovery to AWS.

## Implementation and Verification (2026-10-06)

Reference configuration and operating procedures: [compose.md](../../../compose.md).
Automated disposable integration runner: [compose-check.sh](../../../deploy/test/compose-check.sh).

- Isolated branch `feat/containerization-compose`, based on remote main `fe1d0a0`.
- Docker Engine 29.7.2, Compose v5.5.0, Linux amd64; application build uses Node 24.21.0.
- `docker build --platform linux/amd64 --pull -t bandos:containerization-05 .`: PASS from a fresh source worktree without host dependencies or env files.
  Local application image identity `sha256:c1da34028e791942674e11a039308f70cc1ed4507eb5f8a5510ccf1ebba0d414` (linux/amd64). This is a local artifact identity, not a published registry release.
- Clean lockfile frontend checks ran in `node:24.21.0-bookworm-slim` with the worktree mounted at `/work`, working directory `/work/frontend`: `npm ci --no-audit --no-fund && npm test && npm run lint && VITE_API_ORIGIN=/ npm run build`: PASS, 33 files / 429 tests. Lint exits successfully with zero errors and one pre-existing `EditEvent.jsx` set-state-in-effect warning.
- Clean lockfile backend checks used the same Node container, working directory `/work/backend`: `npm ci --no-audit --no-fund && node --test test/runtime-config.test.js test/frontend.integration.test.js`: PASS, six tests.
- `APP_IMAGE=bandos:containerization-05 bash deploy/test/compose-check.sh`: PASS. Both disposable projects/volumes were removed by the runner. Fresh initialization, non-superuser role flags, no schema CREATE, CRUD across all five tables and generated identity sequences, default private ports, memory/stop limits, absence of API administrator credentials, database/app recreation, full volume-preserving down/up with stable schema OID/data, graceful exit 0, deliberately failed initialization blocking API start, and explicit disposable reset/recovery passed.
- `bash -n deploy/postgres/init.sh deploy/postgres/ready.sh deploy/test/compose-check.sh` and `git diff --cached --check`: PASS.

No retained or local database data was imported or mutated. The local override was rendered and its loopback binding/development configuration asserted without printing credentials. An actual disposable local stack used `LOCAL_HTTP_PORT=13005`, `-f compose.yaml -f compose.local.yaml`, and returned successful `GET /api/v1/health` and frontend HTML via `http://127.0.0.1:13005`; `compose port app 3000` confirmed `127.0.0.1:13005`. Its isolated volume was removed after verification. The local edge bridge is non-internal to enable Docker port publication, while the database bridge remains internal; both base production networks remain internal. TLS/browser/security and comprehensive product/persistence/outage evidence are ticket 06; AWS storage/edge sizing and production recovery are tickets 07–08. No claims of those later verifications are made here.

Independent `review-ticket` review: PASS with all seven acceptance criteria satisfied and no blocking or non-blocking findings. Repeated review after the local network correction also passed.
