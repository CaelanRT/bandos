# BE-V2-15 — Finalize one rehearsal or cancel a poll atomically

> **Status:** Not started
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
