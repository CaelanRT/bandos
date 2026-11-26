# FE-V2-03 — Make versioned saves safe to retry

> **Status:** Completed ([Merged PR #116](https://github.com/CaelanRT/bandos/pull/116))
> **Dependencies:** [FE-V2-01](01-api-contract-boundary.md), [FE-V2-02](02-session-access-and-activity.md)
> **Created:** 25 November 2026

## Objective

Add the smallest reusable intent/conflict support needed by forms. Retrofit existing rename/profile/update/delete callers with loaded versions and keys; later feature tickets add their required domain payloads. Do not build a generic workflow framework.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 3, 9; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 2; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). The [sequence and shared delivery rules](00-ticket-sequence.md) and [reconciliation decisions](../01-implementation-reconciliation.md) apply to this ticket.

## Current implementation and scope

Existing writes omit versions and Idempotency-Key. CreateEvent offers Create again after uncertainty, risking a duplicate. Existing cache coordinators provide useful cancellation and authoritative-save patterns.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/features/events/CreateEvent.jsx](../../../../frontend/src/features/events/CreateEvent.jsx)
- [frontend/src/features/events/EditEvent.jsx](../../../../frontend/src/features/events/EditEvent.jsx)
- [frontend/src/features/bands/api.js](../../../../frontend/src/features/bands/api.js)
- [frontend/src/features/account/profile.js](../../../../frontend/src/features/account/profile.js)
- [frontend/src/features/events/queries.js](../../../../frontend/src/features/events/queries.js)
- [backend/utils/mutation.js](../../../../backend/utils/mutation.js)

## Acceptance criteria

- [x] For every keyed deliberate submit, validate first, freeze method/path/body plus one UUID Idempotency-Key in memory, block double submission, and retain the exact intent until outcome is known.
- [x] Offer explicit retry after response loss using the same key/body, including stable new-slot/option clientKeys. Editing cannot silently mutate an unresolved retry; explain changed intent and reconcile the previous outcome before a new submission could duplicate effects.
- [x] Use loaded band/user/event/poll expectedVersion, band.version as creation templateVersion and independent expectedVoteVersion for row saves. No blind refresh-and-resubmit or client-side version increment.
- [x] Handle STALE_VERSION with retained in-memory draft and explicit reload/discard warning. Handle REQUEST_IN_PROGRESS as same-intent recovery, and IDEMPOTENCY_KEY_REUSED as a client/request mismatch rather than silently issuing a new key.
- [x] Key all band/event/poll writes and authenticated account mutations except notification preference PUT. Do not apply stored-replay assumptions or automatic token-consumption retries to /auth/*.
- [x] Use returned authoritative representations and cancel older reads before cache writes. Invalidate affected lists/resources without converting a successful save into failure if a follow-up read fails; never publish unsent selections.
- [x] Replace existing Create again uncertainty copy/behavior with same-intent recovery as forms adopt it. Scope access-loss cleanup to the inaccessible resource/band; session loss clears all protected data.

## Verification

Test exact same key/body after simulated committed response loss, stable clientKeys, no double click, changed intent, stale reload cancellation, access loss and endpoint exemptions. Extend existing rename/profile/delete tests for exact versioned requests. Each later form ticket verifies its adoption.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Follow the sequence’s definition of done and record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.

## Implementation verification — 26 November 2026

- `npm test -- --reporter=dot` from `frontend/`: 36 files, 479 tests passed.
- `npm run lint`: passed without warnings.
- `VITE_API_ORIGIN=http://localhost:3000 npm run build`: passed; API origin matches `.env.example`. An initial build without the required origin stopped at configuration validation.
- `git diff --check`: passed.

Coverage includes committed response loss with identical key/method/path/body, frozen slot/option client keys, changed-intent blocking, unresolved-save navigation protection (including closed delete/deactivation dialogs), concurrent submission prevention, explicit stale reload/discard and cancellation, key mismatch and in-progress recovery, auth/preference exemptions, scoped access loss, canceled older reads, authoritative cache updates, and exact versioned rename/profile/event/delete requests.

This is the shared retry/version increment. New creation instrumentation, eligibility, lineup and poll form fields remain owned by their later feature tickets, as specified above. No live backend or browser smoke verification is claimed.

Independent `review-ticket` review: PASS, with no blocking or non-blocking findings. Reviewer also ran four focused creation/deletion/deactivation suites (46 tests passed) and `git diff --check`.
