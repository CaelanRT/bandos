# BE-V2-17 — Deactivate accounts only after resolving leadership obligations

> **Status:** For Review — [Draft PR #107](https://github.com/CaelanRT/bandos/pull/107)
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [06](06-password-recovery.md), [07](07-profile-email-change.md), [16](16-band-lifecycle.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–4, 6–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2, 8–9

## Outcome

An account can deactivate safely across all bands without abandoning leadership, leaving partial memberships or retaining live credentials.

## In scope

- Replace the existing DELETE `/users/me` behavior with validated `{expectedVersion,password}`, current credential verification and shared idempotency.
- Lock affected accounts/bands/resources in the approved order, discover and recheck active ownership obligations and reuse the membership-removal transaction across every current band.
- Atomically soft-deactivate, remove all memberships/future assignments/open-poll participation, invalidate applicable defaults and tokens, advance session generation and queue removal effects. Preserve historical display facts.

## Acceptance criteria

1. If any active owned band exists, return `409 LEADERSHIP_TRANSFER_REQUIRED` with only the actor's blocking bands and no partial account/band/notification effects.
2. Credential/version/validation/session failures preserve the entire account state; deactivation credential failure follows shared INVALID_CREDENTIALS behavior.
3. After leadership is resolved, all current memberships, future event invitation statuses and open-poll rows/votes retire in one commit; past and closed-poll records remain stored.
4. Every session and applicable token is revoked. In-flight old-session writes cannot commit afterward; cleanup of cookie/session rows cannot undo committed deactivation.
5. Removal effects obey recipient active-state rules at dispatch: a deactivated recipient is not sent ordinary notification mail. No former membership grants resource access.
6. Concurrent ownership transfer/member removal/deactivation cannot strand a leader or partially remove only some bands; retries create no extra retirement/mail effects.

## Verification

Test blocked leader deactivation with multiple bands, wrong password/stale version, allowed multi-band removal and a forced mid-transaction failure. Verify history, revoked sessions/tokens, active-recipient suppression and races with transfer/old-session writes. Covers V2-07, V2-11 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.


## Implementation and verification

- Strict `{expectedVersion,password}` validation and the shared ordered-lock,
  version/idempotency transaction replace the old deactivation handler.
- Active ownership is rechecked across every affected band; discovery retries if
  an add/transfer introduces a new band while waiting for the account lock.
  Blocking details contain only the actor's active owned bands.
- Reuses membership removal across all current bands in one commit. Upcoming
  invitation statuses and open poll generations retire, defaults become
  inapplicable, and removal effects queue without erasing historical facts/votes.
  Soft deactivation clears pending email, advances version/session generation and
  revokes unused account tokens. Best-effort session cleanup follows commit.
- Runtime behavior: [account deactivation](../../../db/account-tokens.md#account-deactivation-be-v2-17).
- Ticket suite: `TEST_PG_ADMIN_URL=<disposable PostgreSQL 16 admin URL> node --test test/account-deactivation.integration.test.js`
  — **8 passed** (seven behavior checks plus parent). Covers multiple blocking
  owned bands, validation/password/version/session failures, multi-band cleanup,
  history/defaults, token/session revocation, inactive-recipient suppression,
  forced failure in the second band, changed-candidate/transfer/removal races,
  old-session writes waiting behind deactivation and post-commit cleanup failure.
- Regression: `TEST_PG_ADMIN_URL=<disposable PostgreSQL 16 admin URL> node --test $(rg --files test -g '*.test.js' | rg -v '(runtime-security|readiness-shutdown)')`
  — **127 passed, 34 failed**. Both unchanged event-save and poll-composition
  suites use fixed November 2026 session deadlines expired against the real
  session-store clock. Reproduced **34 failures** in those suites on a separate
  unchanged `origin/main` export; no fixtures were weakened or bypassed.
- `node --test test/runtime-security.integration.test.js` with disposable TLS
  PostgreSQL and trusted/untrusted CA fixtures — **3 passed**.
- Actual-app smoke — **PASS**: Origin rejection, blocked leader, ownership
  transfer, deactivation, revoked login/session/retry, preserved new-leader access
  and event/poll retirement with exact outbox effect counts. Uses a disposable
  database and fake provider; no real mail was sent.
- JavaScript syntax checks and `git diff --check` — **PASS**. The backend defines
  no lint/build/typecheck scripts. The separate readiness/outage suite is
  unaffected and was not rerun.

- Final regression run excluding the two confirmed pre-existing failing suites
  (and separate TLS/outage runners) — **127 passed, 0 failed**.
- Independent `review-ticket` review — **PASS** on all six acceptance criteria,
  with no blocking or non-blocking findings. The reviewer independently reran
  the ticket suite (**8 passed**) and syntax/diff checks.
