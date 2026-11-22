# BE-V2-14 — Save complete own availability rows without respondent conflicts

> **Status:** In progress
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

## Implementation and verification

- Added strict PUT availability validation and an actor-only transactional save.
  Current assignment and row locks, composition/row versions, and exact current
  option revisions protect each save. Vote changes preserve poll version and
  timestamps; normalized answer ordering makes identical saves no-ops.
- Changed rows enqueue one `pollResponses` summary addressed to the current
  leader. Existing dispatch handles preferences and normal self-leader mail.
- `TEST_PG_ADMIN_URL=<disposable PostgreSQL 16 admin URL> node --test test/poll-availability.integration.test.js`
  — **6 passed** with normal wall-clock time. Covers complete sets, authorization,
  revisions, generation replacement, real concurrent saves, stale conflicts,
  idempotent retries, no-ops, elapsed/closed polls, and preference-controlled mail.
- Both poll suites — **16 passed**. Existing composition fixtures use 20 November
  2026 sessions; a temporary preload pinned only the session store expiry
  comparison to that fixture date. New availability fixtures use 2030 dates.
- Broader backend regression run — **136 passed, 2 failed** of 138 counted tests.
  Both failures represent one unchanged event-delivery test and its parent suite:
  `test/event-save.integration.test.js:709` resets to real `Date.now()` before
  creating a fixed 21 November 2026 event, now in the past. This fixture issue
  remains outside BE-V2-14. Runtime-security/readiness suites need separate
  infrastructure and were not rerun for this endpoint change.
- Remaining regression suites excluding that unchanged event suite — **114 passed**.
- Independent `review-ticket` review — **PASS** on all six acceptance criteria,
  no findings; reviewer independently reran the availability suite (**6 passed**).
- `node --check` passed for all changed/new JavaScript; `git diff --check` passed.
  No backend lint/build/typecheck scripts are defined.
- Actual-app smoke passed verified login, Origin/assignment authorization,
  complete No-row save, unchanged composition version, replay, stale rejection,
  and no-op summary suppression using an isolated database and fake provider.
- Poll finalization/cancellation and membership lifecycle remain assigned to
  BE-V2-15–17.
