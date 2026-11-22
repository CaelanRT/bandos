# BE-V2-18 integrated backend verification

Run date: 22 November 2026. Base: `origin/main` at `f16e776`.
Implementation: updated band/event smoke runners, repaired two expired session
fixtures, and published the [current runtime API reference](../02-runtime-api.md).
No application behavior or dependencies changed.

## Acceptance map

The regression command below runs these tests together, each integration file in
its own process/database with deterministic application clocks and fake providers.
The new smoke runner additionally crosses mounted production app routes in one
flow: registration → verification → catalog → repeated slots → member/default →
event issue/retry/respond/time change/no-op/stale/decline/cancel → poll/vote/finalize
→ ownership transfer/removal/deactivation → delivery outage/restart.

| Scenario | Backend evidence (`test/` unless stated) |
| --- | --- |
| V2-01 | `band-catalog.integration.test.js`, `member-defaults.integration.test.js`, `event-save.integration.test.js`, `poll-composition.integration.test.js`: starter/custom/repeated instruments, 1–50 slots, eligibility, duplicate/foreign IDs. |
| V2-02 | `member-defaults.integration.test.js`, `band-catalog.integration.test.js`: complete defaults, applicability repair, missing/removed slots, immutable snapshots; smoke applies returned mappings explicitly. Local confirmation UI belongs to frontend. |
| V2-03 | `event-save.integration.test.js`: atomic partial issue, stable/fresh invitation IDs, replacement/removal and rollback; smoke retries one create key. Unsent selections remain local. |
| V2-04 | `event-save.integration.test.js`: Pending/Accepted/Declined transitions, own invitation identity, explicit leader assignment, future/past ordering; event smoke uses invitation-based datebook inputs. Rendering belongs to frontend. |
| V2-05 | `event-save.integration.test.js`, `poll-composition.integration.test.js`, `band-lifecycle.integration.test.js`: hidden list/direct, private reasons, cross-band IDs, member writes and former-member access; smoke verifies permission loss after removal. |
| V2-06 | `event-save.integration.test.js`: response/no-op mail, local/end/instant/timezone changes, DST gap/overlap, exact-start rejection and past cancellation rules. |
| V2-07 | `band-lifecycle.integration.test.js`, `account-deactivation.integration.test.js`, `notification-delivery.integration.test.js`: history/default repair, atomic ownership, waiting old-leader writes, queued leader redirect and blocked deactivation. |
| V2-08 | `poll-composition.integration.test.js`, `poll-availability.integration.test.js`: option revisions, complete own rows, independent respondents, no-op responses, assignment-generation removal/re-add and recipient precedence. |
| V2-09 | `poll-terminal-actions.integration.test.js`: empty finalization zero-effects, No/missing answers, one Pending rehearsal, concurrent finalize/cancel, terminal protection after replay expiry. Smoke finalizes despite No answers. |
| V2-10 | `notification-delivery.integration.test.js`, `notification-mail.test.js`, domain tests: master/category permutations, security bypass, rollback, outage/restart/lease recovery, stable keys/bytes, bounded retries and unknown delivery. Both smoke modes restart a dispatcher against the same durable outbox. |
| V2-11 | `registration-verification.integration.test.js`, `password-recovery.integration.test.js`, `profile-email-change.integration.test.js`, `account-deactivation.integration.test.js`: token purpose/expiry/reuse/concurrency, encrypted payloads, shared throttles, original-session bounded continuation, nonmatching/expired-session login, email uniqueness and all-device revocation. |
| V2-12 | `bounded-sessions.integration.test.js`, `mutation-concurrency.integration.test.js`, account tests: independent idle/absolute boundaries, background vs active GETs, generation/expiry commit races and no post-expiry mutation. Safe login return UI belongs to frontend. |
| V2-13 | `mutation-concurrency.integration.test.js`, domain tests: stale zero-effects, independent vote rows, response-loss/same-key replay, access recheck, seven-day pruning, terminal protection beyond retention. |
| V2-14 (API) | `mutation-validation.test.js`, account/session/domain tests: dotted/sanitized malformed errors, token failure, empty collections, stale/conflict recovery, restricted/revoked/removed access. Browser loading, partial datebook failure, keyboard, focus, cache and responsive interaction remain frontend-owned. |

## Actual commands and results

From `backend/`, with PostgreSQL 16 and the existing installed dependencies:

```sh
docker run --detach --rm --name bandos-v2-18-test \
  -e POSTGRES_USER=bandos_test -e POSTGRES_PASSWORD=disposable \
  -e POSTGRES_DB=postgres -p 127.0.0.1:55439:5432 postgres:16
docker exec bandos-v2-18-test pg_isready -U bandos_test

TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55439/postgres \
  node --test $(rg --files test -g '*.test.js' | rg -v 'runtime-security|readiness-shutdown')
```

PASS: **161 tests, zero failures/skips**, including frontend-serving tests against
the existing generated `frontend/dist` bundle. This command intentionally
separates the two suites with special TLS/container lifecycle prerequisites.
Expected injected rollback failures log database errors during passing assertions.

```sh
TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55439/postgres \
  bash test-scripts/band-smoke-test.sh
TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55439/postgres \
  bash test-scripts/event-smoke-test.sh
```

PASS: **25 band and 40 event HTTP checks**, plus semantic assertions and durable
fake-provider outage/restart checks in each. These scripts now own their random
database and ephemeral app/port. Explicit fixture database/mail settings override
the app's `.env` defaults; the runners never contact a retained stack. Three users register and verify with the original session rather than
bypassing the verification gate. Token fixtures decrypt only test-key ciphertext.
Automatic mail polling is held so the fixture can deterministically read tokens;
explicit real outbox dispatch uses a fake adapter. Production routing, Origin,
session middleware and controllers remain mounted. Provider fetch in the child
is denied. Cleanup runs on normal completion/assertion failure. Forced termination
may require manual removal of the identified disposable database/container.
Legacy teardown scripts no longer load `.env` or delete retained data; callers
with old run prefixes are told to preserve that data for manual inspection.

Runtime-security prerequisites: created a fresh `bandos_runtime` database in the
same disposable container and loaded `db/schemas/schema.sql`. Generated a two-day
self-signed test certificate with CN/SAN `localhost`, copied certificate/key into
the container, set PostgreSQL `ssl=on`, `ssl_cert_file`, `ssl_key_file` using
`ALTER SYSTEM` and reloaded. The key is owned by postgres, mode 0600. Used a
separate untrusted test CA for the negative verification path.

```sh
DB_HOST=localhost DB_PORT=55439 DB_NAME=bandos_runtime \
DB_USERNAME=bandos_test DB_PASSWORD=disposable \
DB_SSL_CA_FILE=/tmp/be-v2-18-tls/server.crt \
TEST_UNTRUSTED_CA_FILE=/tmp/bandos-session-tls/untrusted.crt \
  node --test test/runtime-security.integration.test.js
```

PASS: **3 tests**, trusted/untrusted/hostname TLS, trusted proxy boundaries,
production HTTPS/CORS, bcrypt cost and secure bounded cookies. Mail is fake.
Certificate paths above identify disposable fixtures used for this run; regenerate
local test certificates for another run. No private/runtime secrets were reused.

```sh
docker run --detach --name bandos-readiness-test \
  -e POSTGRES_USER=bandos_test -e POSTGRES_PASSWORD=disposable \
  -e POSTGRES_DB=postgres -p 127.0.0.1:55440:5432 postgres:16
TEST_PG_CONTAINER=bandos-readiness-test DB_HOST=127.0.0.1 DB_PORT=55440 \
DB_USERNAME=bandos_test DB_PASSWORD=disposable DB_NAME=postgres \
  node --test test/readiness-shutdown.integration.test.js
```

PASS: **4 tests**, database outage/pause/restart/recovery and graceful/forced
shutdown. This container must be restartable: do not use `--rm` for this suite.
The tests deliberately stop and pause it. Never point them at retained data.

```sh
bash -n test-scripts/*.sh
node --check test-scripts/v2-smoke.cjs
git diff --check
```

PASS. `package.json` defines only `dev` and `start`; no npm test/lint/build/typecheck
script was claimed. Aggregate automated result: **168 tests passed** plus smoke
checks. The existing frontend bundle was exercised, not rebuilt or changed.

## Findings and limits

The initial consolidated run found expired wall-clock cookies in event-save and
poll-composition fixtures (fixed application time was 20 November 2026, already
past the cookie's idle deadline on this run). Updated them to the future 2030
clock already used by other v2 tests and moved dependent schedule/DST cases to
2030/2031, preserving exact gap/overlap assertions. Removed wall-time switching
from the event delivery case so its application clock stays deterministic.
These fixed future fixtures should be refreshed before 2030; production session
policy was unchanged. The first readiness attempt incorrectly used `--rm`,
which removed the fixture on stop; rerun with the restartable fixture passed.
No application integration defect remained in the exercised backend contract.

No real Resend call, mailbox delivery, deployment, migration, frontend-v2 browser
interaction, accessibility audit, or full frontend-v2 acceptance is claimed.
API save/queue success is separate from provider acceptance and inbox delivery.
Review the frontend's exact shared shapes against the current runtime reference;
frontend v2 work and its interaction checks remain separate tickets.

Independent `review-ticket` review: **PASS**. All six acceptance criteria passed;
no blocking findings. Reviewer independently reran both smoke modes (25/40 HTTP
checks), shell/runner syntax and diff checks, and inspected the 168 passing test
results. Clarified the one nonblocking wording observation: `/auth/*` token
endpoints are exempt from idempotency keys; authenticated email-change initiation
and resend require them.
