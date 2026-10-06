# Validate backend runtime configuration and deployment security

> **Status:** For Review — [Draft PR #63](https://github.com/CaelanRT/bandos/pull/63)

> **Dependencies:** None. Owns the runtime configuration/security contract used by tickets 02–05.

## Objective

Provide a documented, validated runtime configuration contract for the backend, including trusted proxy policy and verified database TLS. Keep production authentication and HTTPS behavior intact.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 2, 3 (proxy and image/configuration decisions), 4, 5 (health), 6 candidate 1, and 8. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

`app.js` reads settings directly and hardcodes one trusted proxy hop. `db/index.js` uses `rejectUnauthorized: false`; registration passes an unset bcrypt cost through `Number()` without the documented default.

## Scope

- Add a secret-free backend environment example and configuration reference separating frontend build values from runtime secrets.
- Validate required database, session, and origin settings; document and validate PORT 3000, DB_PORT 5432, BCRYPT_ROUNDS 12, TLS mode, and proxy policy.
- Support trusted CA configuration for external database TLS; restrict trust to the configured edge topology.

## Out of Scope

- Readiness exception and shutdown are owned by ticket 02; static middleware by 03.
- AWS resources, actual host secrets/domains, changing rate limits, and a broad app/export refactor.

## Acceptance Criteria

- [x] Missing required or invalid configuration fails startup with actionable diagnostics that do not reveal secret values.
- [x] Omitted ports and bcrypt cost resolve to the documented defaults; explicit values are validated, including integer bcrypt cost within its supported range.
- [x] DB_SSL=false supports the approved private Compose network. Enabled TLS verifies server identity using documented trusted CA/system-CA behavior; untrusted certificates fail rather than falling back to insecure TLS.
- [x] Production requires HTTPS except the narrow health allowance owned by 02; only the configured trusted proxy policy affects protocol and client IP.
- [x] CORS remains limited to CLIENT_ORIGIN and credentials; bandos.sid retains Secure in production, HttpOnly, SameSite=Lax, and rolling seven-day expiry.
- [x] The tracked example/reference contains no credentials and explains stable SESSION_SECRET, the existing five DB_* variables, and separation from PostgreSQL bootstrap credentials.

## Testing Strategy

### Unit Tests

- Focused validation/default tests, including omitted bcrypt cost, invalid ports/cost/TLS/proxy inputs, and secret-safe error output.

### Integration Tests

- TLS trusted/untrusted CA connection checks; trusted versus untrusted forwarded protocol/client IP behavior; production cookie/CORS and HTTP rejection checks on a disposable database.

### Manual / Smoke Verification

- Start with the documented example plus private test secrets; confirm bad configuration fails before serving traffic and registration/login succeeds with validated bcrypt cost.

### Explicitly Not Required

- No new general backend test platform or application export restructuring solely for containerization.

## Implementation Notes

- Code: [app.js](../../../backend/app.js), [db/index.js](../../../backend/db/index.js), [auth.controller.js](../../../backend/controllers/auth.controller.js), [auth.routes.js](../../../backend/routes/auth.routes.js).
- Contracts: [API transport/authentication](../../../backend/backend-specs/00-api-contract.md), [backend scaffold](../../../backend/backend-specs/01-backend-scaffold.md). The plan explicitly overrides stale scaffold assertions about app exports and the currently missing cost default.
- Choose CA setting names and explicit proxy configuration syntax during implementation and document them. A test topology can establish the contract; ticket 07 selects actual AWS hops. Never trust all callers or globally forge HTTPS.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [x] Existing relevant tests pass; no known regression exists in touched behavior.
- [x] Run new focused backend checks and relevant existing smoke checks against disposable data; run `node --check` on changed JavaScript and `git diff --check`. Backend currently has no npm test, lint, or typecheck script; document the exact new check command.
- [x] No unnecessary out-of-scope work is introduced.
- [x] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Ticket 02 adds the exact private readiness probe; ticket 07 supplies actual topology and secrets.

## Implementation Verification — 2026-10-06

- Centralized runtime configuration in `backend/config.js`; documented its contract in `backend/runtime-configuration.md` and a secret-free `.env.example`.
- `node --test test/runtime-config.test.js test/runtime-security.integration.test.js`: 7 passed. Integration used disposable PostgreSQL 18 with test-only CA certificates; verified trusted/untrusted CA, default CA rejection, hostname mismatch, plaintext private connection, trusted/untrusted forwarded protocol/IP, production HTTP rejection, credentialed CORS, default-cost registration/login, and rolling secure cookies.
- The documented example plus private disposable database/session values started successfully; bad configuration exited before listening.
- Existing band smoke suite: 20 passed. Existing event smoke suite initially failed because its timestamp/PID fixture prefix exceeds the username limit with six-digit process IDs. A temporary copy with only `bandos_event_smoke_` shortened to `bandos_evt_` passed all 48 checks against a fresh API process; the repository smoke script is unchanged.
- `node --check` passed for all six added/changed JavaScript files; `git diff --check` passed. No backend npm test/lint/typecheck/build script exists. Frontend is untouched.
- Readiness exception and shutdown remain ticket 02; actual edge topology remains ticket 07.

Independent `review-ticket` review: PASS; all six acceptance criteria passed, no blocking or non-blocking findings. The reviewer independently reran the seven Node checks, syntax checks, and whitespace check.
