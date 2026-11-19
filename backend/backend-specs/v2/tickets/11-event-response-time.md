# BE-V2-11 — Record invitation responses and require time-change reconfirmation

> **Status:** Not started
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [10](10-event-save-invitations.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 4–5, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 3, 5, 7, 10

## Outcome

Musicians can change their own response before start, and saved schedule edits reset only the invitations that require reconfirmation.

## In scope

- Implement PUT `/bands/:bandId/events/:eventId/invitations/:invitationId/response` with expected event version, accepted/declined and optional private reason.
- Record actual response/history changes and distinguish system reconfirmation from musician responses. Serialize private reasons only to current leader or reason owner.
- Complete event PATCH semantic detail comparison and notification recipients, reusing `utils/event-schedule.js` and persisted startsAt/endsAt.
- Normalize nullable/blank decline reasons, enforce trimmed 1,000-character maximum and reject non-null reasons on acceptance.

## Acceptance criteria

1. Only the current active invitation owner responds; a leader must also be assigned and is never automatically accepted. Retired/foreign invitations are unavailable.
2. Initial/changed status creates one current-leader response effect. Identical response is a no-op; reason-only change updates private data without a status email; acceptance clears the prior reason.
3. Any local date/start/end change OR resolved start/end change resets retained Accepted to Pending; Pending stays Pending, Declined stays Declined. Reconfirmation is not emailed as a musician response.
4. Timezone representation-only edits preserving local fields and both instants retain statuses but produce ordinary detail-update mail. End-time-only or timezone-induced instant changes require reconfirmation.
5. Semantic detail-update email targets retained Pending/Accepted invitees only. Added users receive invitation only, removed/replaced users removal only; label/order-only saves send nothing.
6. DST gaps reject and overlaps choose the earlier occurrence. Exact-start boundary, expired sessions and stale versions block writes with zero response/history/mail effects.

## Verification

Test response transitions, no-ops/reason-only edits/privacy and 1,000-character boundary. Use fixed clock and schedule fixtures for local/end/instant/alias edits, gaps/overlaps and start cutoff; assert exact effect recipients on combined detail/reassignment saves. Covers V2-06 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
