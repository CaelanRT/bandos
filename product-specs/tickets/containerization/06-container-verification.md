# Verify containerized product flows, persistence, and failure recovery

> **Status:** For Review

> **Pull Request:** [Draft PR #68](https://github.com/CaelanRT/bandos/pull/68)

> **Verification:** [Commands, topology and results](06-verification-results.md)

> **Dependencies:** [05 — Compose/database](05-compose-database.md); runtime and frontend behaviors from 01–04 complete.

## Objective

Add a repeatable disposable verification workflow and record evidence that the reference container stack preserves the current product and deployment contracts.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 6 candidate 4 (verification and smoke-test integration details), 7 criteria 1–8. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

Backend band/event smoke suites use different default ports, create seven users in total, and the event suite/teardowns source backend/.env and require psql. Both suites from one IP within an hour exceed the five-registration limit.

## Scope

- Provide a disposable test runner or equivalent configured host runner with Node, curl, Bash, and PostgreSQL client tools outside the production image.
- Run clean build/frontend checks and existing band/event suites with explicit API URL, isolated state, and safe teardown.
- Record production-mode HTTPS browser/security, static routing, persistence, outage recovery, and shutdown verification in a result document linked from the sequence.

## Out of Scope

- AWS provisioning, production backup/restore and rollback demonstration (08), CI workflows, and product changes.
- Weakening rate limits, exposing production PostgreSQL, or adding test tools to the runtime image.

## Acceptance Criteria

- [x] The documented runner excludes local backend/.env, supplies explicit BASE_URL ending /api/v1 for both suites, and connects only to a designated disposable database.
- [x] Both existing smoke suites pass using isolated stacks/state or a fresh API instance between suites so production registration limits remain unchanged; SQL mutations and teardown are confined to disposable data.
- [x] Frontend test/lint/build and clean image build pass; record exact commands, artifact identity/platform, environment, and results without secrets.
- [x] Through a production-mode HTTPS test edge, registration/login, identity restoration, logout, account updates/deactivation, bands/memberships, schedules/events, and timezone behavior work.
- [x] Cookie flags, exact CORS origin, trusted forwarded protocol/client IPs, unchanged registration/login limits, and rejection of public forwarded-header spoofing are verified separately from suite isolation.
- [x] Deep-link refresh, unknown UI paths, missing assets, JSON API errors, CSP/content/cache headers, and browser same-origin requests work; static files remain available during database outage.
- [x] Users, memberships, events, and sessions survive app replacement and full volume-preserving stack stop/start with stable SESSION_SECRET; database outage produces bounded 503 and recovers.
- [x] Non-root execution, runtime dependency scope, absence of baked secrets, and graceful/timeout shutdown meet tickets 01–05; the result document records pass/fail and any limitations.

## Testing Strategy

### Unit Tests

- Reuse existing frontend and focused backend checks; add no duplicate unit suite.

### Integration Tests

- Automate clean stack bootstrap, both smoke suites, persistence assertions, health outage/recovery, image/user inspection, and stop checks where feasible; reuse routing/security coverage from 01–03.

### Manual / Smoke Verification

- Perform the production HTTPS browser flow/security/static matrix above; inspect DevTools requests/cookies/CSP and test spoofed forwarded headers against the representative edge. Record exact topology so AWS differences can be rechecked in 08.

### Explicitly Not Required

- Full new browser automation framework, performance/load testing, or a production database test teardown.

## Implementation Notes

- Code: [band suite](../../../backend/test-scripts/band-smoke-test.sh), [event suite](../../../backend/test-scripts/event-smoke-test.sh), [band teardown](../../../backend/test-scripts/teardown-band-smoke-test.sh), [event teardown](../../../backend/test-scripts/teardown-event-smoke-test.sh).
- Contracts: [API](../../../backend/backend-specs/00-api-contract.md) and [frontend foundations](../../../frontend/frontend-specs/01-phase-0-foundations.md). A local HTTP development override cannot prove Secure production authentication; use a trusted HTTPS test edge without globally forging HTTPS. Preserve teardown safeguards.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [x] Existing relevant tests pass; no known regression exists in touched behavior.
- [x] Run frontend `npm test`, `npm run lint`, and `npm run build`; run relevant focused backend checks, Docker/Compose checks described above, `bash -n` on changed shell scripts, and `git diff --check`. Use clean lockfile installs and disposable databases.
- [x] No unnecessary out-of-scope work is introduced.
- [x] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Ticket 08 demonstrates actual AWS topology, backup restoration, and rollback; 09 reuses disposable verification in CI.
