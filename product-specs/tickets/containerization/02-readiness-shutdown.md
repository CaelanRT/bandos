# Bound API readiness and gracefully stop the backend

> **Status:** For Review — [Draft PR #64](https://github.com/CaelanRT/bandos/pull/64)

> **Dependencies:** [01 — Runtime configuration/security](01-runtime-configuration-security.md).

## Objective

Make dependency readiness and process shutdown safe for Compose and release operations without weakening HTTPS enforcement.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 2, 5 (health and shutdown), 6 candidate 1, and 7 criteria 4, 6–7. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

Health only runs an unbounded SELECT 1. Production rejects it over HTTP before routing; the server handle is not retained and the existing pool close() is unused.

## Scope

- Allow only the exact read-only private GET /api/v1/health probe before the production HTTPS guard.
- Bound database/readiness waits, handle idle pool errors, and allow recovery after database availability returns.
- Handle SIGTERM/SIGINT once, stop accepting requests, drain within a documented bound, and close the pool.

## Out of Scope

- Schema completion gating belongs to 05; health remains dependency readiness rather than proving schema existence.
- Static delivery, deployment automation, a separate HTTP liveness API, and restart loops on database outage.

## Acceptance Criteria

- [x] Private GET /api/v1/health works in production without session authentication and retains the API contract: 200 data.status=ok or 503 DATABASE_UNAVAILABLE.
- [x] The exemption does not allow other paths or methods to bypass production HTTPS enforcement; network access to the probe remains private in deployment configuration.
- [x] Database failures/timeouts produce bounded readiness failure; idle pool errors are handled without an unhandled crash and new requests recover after PostgreSQL returns.
- [x] SIGTERM and SIGINT stop new connections, allow active requests a bounded drain, close the pool, and exit within the documented stop period; repeated signals do not duplicate cleanup.
- [x] Forced termination is the final timeout path and the configured grace period can accommodate the drain bound.

## Testing Strategy

### Unit Tests

- Focused tests of exact probe eligibility and duplicate-signal handling where isolated logic is introduced.

### Integration Tests

- Process-level tests with PostgreSQL: health up/down/timeout/recovery, idle pool error, active request during stop, and bounded forced-exit path. Check protected HTTP requests still receive 426.

### Manual / Smoke Verification

- Run the production process, probe privately, interrupt it with both supported signals, and verify shutdown logs and exit timing.

### Explicitly Not Required

- General liveness infrastructure or a database outage restart policy; Compose unhealthy status alone does not restart a process.

## Implementation Notes

- Code: [app.js](../../../backend/app.js), [health.controller.js](../../../backend/controllers/health.controller.js), [health.routes.js](../../../backend/routes/health.routes.js), [db/index.js](../../../backend/db/index.js).
- Preserve [health response envelopes](../../../backend/backend-specs/00-api-contract.md). Reuse db.close(); document timeout and drain settings in the configuration reference from 01.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [x] Existing relevant tests pass; no known regression exists in touched behavior.
- [x] Run new focused backend checks and relevant existing smoke checks against disposable data; run `node --check` on changed JavaScript and `git diff --check`. Backend currently has no npm test, lint, or typecheck script; document the exact new check command.
- [x] No unnecessary out-of-scope work is introduced.
- [x] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Tickets 04–06 verify these behaviors in the image and reference stack.

## Implementation Verification — 2026-10-06

- Added an exact GET health middleware before the HTTPS/session boundary, preserving the health envelope and configured CORS. Other methods/path variants and protected HTTP requests still receive 426. A signed expired/nonexistent session cookie does not delay the probe.
- Connection/pool acquisition defaults to 2000 ms; the readiness query defaults to 2000 ms. Failed readiness queries discard the client. Idle pool errors are handled, and the same running process recovers after database restart.
- Both signals initiate cleanup once: close the listener, drain active requests including keep-alive connections, close the pool, then exit 0. The total default shutdown deadline is 10000 ms; stuck work exits 1 at the deadline. The reference documents a minimum 15-second Compose grace period; actual Compose/network restrictions belong to ticket 05.
- `node --test --test-concurrency=1 backend/test/runtime-config.test.js backend/test/runtime-security.integration.test.js backend/test/readiness-shutdown.integration.test.js`: 11 passed using dedicated disposable PostgreSQL 18 and test-only TLS certificates. Run from the repository root with the fixture settings documented in the backend reference. Sequential execution keeps intentional database outages isolated from security checks.
- Production-process probes and SIGTERM/SIGINT smoke checks verified successful active-request drain, refused new connections, one cleanup despite repeated signals, shutdown logging, exit 0 within the two-second test deadline, and no retained pool connections. Stuck work exited 1 after the 400 ms test deadline.
- Existing band smoke suite: 20 passed against a fresh development API process. Existing event smoke suite initially hit the pre-existing six-digit PID fixture username length issue documented in ticket 01; a temporary copy changing only `bandos_event_smoke_` to `bandos_evt_` passed all 48 checks. The repository smoke script is unchanged.
- `node --check` passed for all eight added/changed JavaScript files; `git diff --check` passed. There is no backend npm test/lint/typecheck/build script. Frontend is untouched.

- Additional production smoke with default timeouts: private HTTP health returned 200; SIGTERM exited 0 in 7 ms and SIGINT in 6 ms. Both logged one shutdown start and successful pool closure.

Independent `review-ticket` review: PASS; all five acceptance criteria passed with no blocking or non-blocking findings. Reviewer independently reran all 11 Node checks and the staged whitespace check.
