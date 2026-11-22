# BE-V2-15 — Finalize one rehearsal or cancel a poll atomically

> **Status:** Completed — [Merged PR #102](https://github.com/CaelanRT/bandos/pull/102)
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [10](10-event-save-invitations.md), [11](11-event-response-time.md), [12](12-event-reads-cancellation.md), [13](13-poll-composition.md), [14](14-poll-availability.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–5, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–3, 6–7

## Outcome

A leader can turn any current future option into exactly one rehearsal with fresh invitations, or permanently cancel the open poll.

## In scope

- Implement POST `/bands/:bandId/polls/:pollId/finalize` and `/cancel` with expectedVersion and exact shared response shapes.
- Under band/poll locks validate current lineup, current chosen optionId/revision and future time; atomically create rehearsal details/snapshot slots/fresh Pending invitations and set the unique final event link.
- Implement permanent cancellation with preserved closing snapshot and removal/cancellation effects for all current poll invitees.

## Acceptance criteria

1. Zero current invited musicians returns `400 VALIDATION_ERROR` on slots and leaves the poll open with no event, invitation or mail. At least one invitee is required; No/missing answers do not block selection of a future option.
2. Finalization copies details/visibility, creates one rehearsal and fresh Pending event invitations; poll Yes never implies Accepted. Event invitation emails are queued once.
3. Equivalent repeat finalization for the same option returns the existing event without extra effects; a different option returns POLL_CLOSED. Concurrent/retried finalization cannot duplicate even after replay-record expiry.
4. Closed polls cannot reopen or accept composition/vote changes. Authorized closing answers remain viewable; poll and linked event visibility are checked independently.
5. Cancellation notifies only current invitees, excluding retired musicians, and never creates a rehearsal. Competing cancel/finalize operations commit only one terminal outcome.
6. Stale/version/revision/time/session/authorization failures roll back every effect.

## Verification

Race finalize/finalize and finalize/cancel; test response-loss replay and equivalent repeats after idempotency expiry. Cover empty polls, future versus elapsed options, No/missing answers, fresh Pending statuses, visibility and cancellation recipients. Covers V2-09 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.

## Implementation and verification

- Added strict finalization/cancellation requests using the existing session,
  idempotency and transaction machinery. Finalization locks affected accounts,
  band and poll, rechecks current lineup eligibility and chosen future revision,
  and atomically creates a rehearsal, snapshot slots, fresh Pending invitations,
  invitation outbox effects and the permanent final event/option link.
- Equivalent finalizations return the linked event after replay expiry without
  creating effects. Both terminal actions preserve closing options, assignments
  and answers; cancellation notifies current invitees only. Event serialization
  and replay independently enforce linked-event access.
- `TEST_PG_ADMIN_URL=<disposable PostgreSQL 16 admin URL> node --test test/poll-terminal-actions.integration.test.js`
  — **7 passed**. Covers empty lineups, No/missing/Yes answers, strict input,
  stale/revision/time/eligibility/authorization/session failures, response-loss
  replay and expired records, terminal races, closing visibility, cancellation
  recipients and complete rollback on outbox failure.
- Broader regression run (all suites except runtime-security/readiness):
  **143 passed, 2 failed** of 145 counted tests. The failures are the unchanged
  event-delivery test at `test/event-save.integration.test.js:708` and its parent:
  it resets to real time before creating a fixed 21 November 2026 event, now in
  the past. An isolated unchanged `origin/main` snapshot reproduced the same
  failure (**22 passed, 2 failed** in that suite). Older fixture sessions used
  the previous ticket's temporary session-store expiry comparison preload;
  repository tests were not modified to bypass failures.
- Actual-app smoke — **PASS**, with verified login, Origin/leader authorization,
  No-row finalization, fresh Pending invitations, replay, terminal conflict,
  cancellation snapshot and single event/outbox effects using a fake provider.
- `node --check` passed for all changed/new JavaScript; `git diff --check` passed.
  No backend lint/build/typecheck scripts are defined. Runtime-security/readiness
  suites require separate infrastructure and were not rerun for this slice.
- Independent `review-ticket` review — **PASS** on all six acceptance criteria,
  no findings; reviewer independently reran the terminal-action suite (**7 passed**)
  and syntax/diff checks.
- Band/account lifecycle and final integrated verification remain assigned to
  BE-V2-16–18.

## Completion

Confirmed PR #102 merged into remote `main` on 22 November 2026
(merge commit `5ea5d97`). Completion metadata is recorded here;
BE-V2-16 is next.
