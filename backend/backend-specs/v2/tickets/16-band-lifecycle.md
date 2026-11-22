# BE-V2-16 — Remove members, transfer sole ownership and delete bands atomically

> **Status:** In progress — implementation, verification and independent review passed; Draft PR pending
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [09](09-member-eligibility-defaults.md), [12](12-event-reads-cancellation.md), [13](13-poll-composition.md), [14](14-poll-availability.md), [15](15-poll-terminal-actions.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–5, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–4, 7–8

## Outcome

Band lifecycle actions immediately update management/access and future participation while preserving historical records.

## In scope

- Implement DELETE `/bands/:bandId/members/:userId`, POST `/bands/:bandId/ownership`, and changed versioned/idempotent band DELETE.
- Build the focused membership-removal transaction reused by account deactivation: select upcoming using one server instant, retire all future event statuses and open-poll assignment/vote generations, remove membership and recompute default applicability.
- Transfer sole ownership/current roles under the band lock, preserving both musicians' eligibility/assignments and old leader membership.
- Band deletion atomically cancels upcoming events/open polls, queues eligible cancellations and removes active access; retain past/closed records.

## Acceptance criteria

1. Only the current leader manages lifecycle and all referenced users belong to the band. The owner cannot be removed via member removal.
2. Removal retires future Pending/Accepted/Declined invitations, clears active open-poll votes/participation and invalidates the default together. Template slots remain; history and closed-poll snapshots survive.
3. Removal mails cover all issued future statuses including Declined and active open-poll assignments; an active former member can receive them despite lost band access.
4. Transfer targets another active current verified member and commits exactly one owner. Old-leader concurrent writes recheck ownership and fail after transfer; still-queued leader notices resolve the new leader at dispatch.
5. Band deletion cancellation recipients are future Pending/Accepted event invitees and all current open-poll invitees, excluding Declined event invitees and already-removed poll invitees; preferences apply.
6. No former member retains list/direct/history access. Cancel/remove races cannot leave active participation or double-notify a retired assignment; stale/idempotent/version/no-op semantics hold.

## Verification

Test member removal across future/past/exact-start events and open/closed polls, default invalidation, old-leader race, queued leader resolution and one-owner integrity. Race cancellation/deletion/removal and verify exact recipient effects and historical retention. Covers V2-07 and lifecycle portions of V2-10/V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.

## Implementation and verification

- Added strict versioned/idempotent member removal, ownership transfer and band
  deletion through the shared mutation/session machinery. Ownership is rechecked
  under the band lock, and transfer preserves membership, eligibility and issued
  assignments while updating the sole owner and both roles atomically.
- Added `utils/band-lifecycle.js` with a focused membership-removal transaction
  helper for reuse by BE-V2-17. One server instant selects upcoming events;
  removal retires every issued future status and open-poll generation, preserves
  history/votes and default mappings, and queues removal mail in the same commit.
  Default applicability is recomputed against the remaining membership.
- Band deletion cancels upcoming events and open polls atomically, queues only
  eligible current recipients, retains past/exact-start events and closed-poll
  snapshots, and revokes all band access. Dispatch retains preference checks and
  permits removal notices to reach active former members.
- `TEST_PG_ADMIN_URL=<disposable PostgreSQL 16 admin URL> node --test test/band-lifecycle.integration.test.js`
  — **8 passed** (seven behavior checks plus parent). Covers future/past/exact-start
  events, all invitation statuses, open/closed polls and vote history, default
  invalidation, denied historical/direct/list access, replay and stale input,
  target restrictions, sole ownership, queued leader resolution, waiting old-leader
  writes, exact cancellation recipients/preferences, competing lifecycle actions,
  and complete rollback on outbox failure.
- Regression command: `TEST_PG_ADMIN_URL=<disposable PostgreSQL 16 admin URL> node --test $(rg --files test -g '*.test.js' | rg -v '(runtime-security|readiness-shutdown|event-save|poll-composition)')`
  — **119 passed, 0 failed**. Existing band-catalog/session tests now send the
  required version and idempotency key for band deletion.
- The unchanged event-save and poll-composition suites report **34 failed counted
  tests**, reproduced separately on an unchanged `origin/main` snapshot. Their
  fixed November 2026 session deadlines have expired against the session store's
  real clock. These fixtures were not changed or bypassed. Runtime-security and
  readiness suites require separate TLS/outage infrastructure and were not rerun.
- Actual-app smoke — **PASS**, using a disposable database and fake provider:
  verified login, Origin/leader authorization, ownership transfer, member removal
  and response-loss replay, immediate event/poll access loss, band deletion and
  exact outbox recipient effects.
- `node --check` passed for changed/new JavaScript; `git diff --check` passed.
  No backend lint/build/typecheck scripts are defined.
- Independent `review-ticket` review — **PASS** on all six acceptance criteria,
  with no blocking or non-blocking findings. Reviewer independently reran the
  lifecycle suite (**8 passed**) and syntax/diff checks.
- Account deactivation and final integrated verification remain BE-V2-17–18.
