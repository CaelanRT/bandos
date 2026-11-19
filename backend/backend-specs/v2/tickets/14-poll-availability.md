# BE-V2-14 — Save complete own availability rows without respondent conflicts

> **Status:** Not started
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [13](13-poll-composition.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–5, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–3, 6–7

## Outcome

Each invited musician explicitly saves one complete Yes/No row while independent respondents can save concurrently.

## In scope

- Implement PUT `/bands/:bandId/polls/:pollId/availability` with expectedVersion, expectedVoteVersion and the exact current option/revision answer set.
- Lock/recheck the actor's current assignment generation and own row; preserve missing-versus-No semantics and row versions independently from poll composition.
- Enqueue one current-leader summary when a save changes availability; return the authorized Poll shape and updated row version.

## Acceptance criteria

1. Only the active invited musician can save their own row while open; leaders also require an assignment. Another user/retired generation cannot be targeted.
2. An absent vote row starts at version zero with answers [] and needsResponse true. Save requires exactly one yes/no answer for every current option/revision; reject missing/duplicate/stale/foreign cells.
3. Composition or own-row version mismatch fails STALE_VERSION without partial cells or mail. Closed polls reject saves; an open poll does not close merely because all times passed.
4. A semantic row change increments only that row version and produces one summary, including normal self-leader email subject to preferences. Identical row saves create no version/email effects.
5. Two different musicians can save against the same composition concurrently; vote-only changes never invalidate the leader's composition version.
6. Removal/re-addition creates a fresh blank generation; stale prior-row requests fail. Same-key retries replay one committed save.

## Verification

Use real concurrent database saves for separate respondents and competing own-row edits; test complete sets, current revisions, removed/re-added generations, no-op summaries, closed/elapsed polls and retry loss. Covers V2-08 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
