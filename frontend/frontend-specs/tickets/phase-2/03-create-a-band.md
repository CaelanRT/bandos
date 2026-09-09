# Create a band and enter its Members workspace

> **Status:** Complete (2026-09-09)
> **Merged PR:** [#26 — Phase 2: Create a band and enter its Members workspace](https://github.com/CaelanRT/bandos/pull/26)
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

Any authenticated user can create a band, become its leader, and reach the place where they will add people.

## Context

This slice adds creation access to zero-band home and global navigation, without forcing onboarding.

## In scope

- Dedicated name form at /bands/new, exact validation, pending/field/form errors, and origin-aware Cancel.
- Shared dirty-navigation warning covering Cancel, links, Back/Forward, and best-effort unload protection.
- Confirmed response cache updates and replacement navigation to Members with a consumed-once add-form marker.
- Ambiguous creation reconciliation with duplicate-name caution and deliberate Create again behavior.

## Out of scope

Member-add implementation, automatic name uniqueness checks, band caps, onboarding wizard, and idempotency guarantees absent from the API.

## Routes and access

`/bands/new` requires authentication and is explicitly recognized by routing/destination validation. Creation Cancel uses its separately validated origin or home. Confirmed success goes to `/bands/:bandId/members`.

## API contract

`POST /bands` with exactly `{ name }` (trimmed 1–50 characters) → `201 { band: FullBand }`; refresh `GET /bands` for reconciliation. Handle field validation, authentication, and uncertain network/server/malformed-success failures per specification section 7. Duplicate names are allowed.

## Experience and states

Untouched form has no errors. Pending controls prevent duplicates. Cancel warns only for changed input and returns to origin, not a blind history step. Confirmed success establishes creator Leader and clears dirty state. Uncertain results preserve name and require list checking; matching names never establish success.

## Acceptance criteria

- Both creation entry points work for zero-band and existing-band users.
- Static new route cannot be interpreted as a numeric band route.
- Exact normalized body submits once; no mutation retry occurs.
- Cancel preserves the agreed origin; missing/unsafe origin falls back home.
- Keep editing/Discard and Back navigation work; auth expiration bypasses the guard.
- Successful creation immediately updates list/detail and opens Members; its one-time marker remains usable by ticket 04.
- Ambiguous results cannot auto-navigate to a guessed band; failed reconciliation blocks resubmission until checked.

## Verification

Integration tests cover validation, exact body, duplicates/pending, both entry points, safe origins, history/dirty warnings, success/late-read races, expiration, and uncertain creation with duplicate names and failed recheck. Manually verify keyboard, refresh/unload best-effort behavior, Back/Forward, and narrow form. Run lint, tests, build.

## Dependencies

[02 — Inspect members](02-view-band-members.md), which depends on 01.

## Decisions and follow-ups

Before ticket 04, creation lands on the real member list without a fake add control. Once 04 lands, the marker opens its form once.


## Implementation and verification — 2026-09-09

- Added both creation entry points and an authenticated static `/bands/new` route, exact trimmed name validation, server field/form errors, rate-limit handling, and a separately validated Cancel origin.
- Shared unsaved-navigation hook/dialog covers links, Cancel, Back/Forward, and best-effort unload. Pending writes prevent premature Discard; session expiration and confirmed creation bypass the guard.
- Confirmed creation validates the full response and creator Leader membership, cancels older reads, updates list/detail caches, and replacement-navigates to Members. `useCreationIntent` consumes the one-time marker and supplies a reusable initial value for ticket 04.
- Uncertain writes check the latest list without guessing by name. Failed checks block resubmission; successful checks offer inspection and deliberate Create again with duplicate-band caution.
- Added 28 integration cases covering validation, pending duplicates, origins/history, focus, cache races, confirmation/marker consumption, expiration, server errors, rate limits, and uncertain writes/rechecks. Updated prior band expectations for the implemented static route and entry points, and removed a timing assumption from the registration identity-recovery assertion so destination reads do not make it flaky.

Implemented and merged in [PR #26](https://github.com/CaelanRT/bandos/pull/26) on 2026-09-09. Member addition and Settings remain separate tickets; Phase 2 is not complete.

## Worktree review — 2026-09-09

Reviewed the existing implementation against `origin/main` (`0fb060d`) and the Phase 2 specification. Before packaging, all ticket changes were uncommitted; there were no branch-only commits.

### Verified

- `npm run lint` passed.
- `npm test` passed: 239 tests across 17 files, including 28 creation cases.
- `npm run build` passed.
- Standards review found no hard documented violations.

### Follow-ups retained after merge

- **Functional finding:** The global Create a band link remains active on `/bands/new`. Clicking it again overwrites `creationOrigin` with `/bands/new`, so Cancel falls back home instead of the original band workspace. With changed input, choosing Discard changes for this same-page navigation retains the mounted form and its input. Make the current-page item non-navigating or otherwise preserve the original origin and correct discard behavior; add a regression case.
- **Browser verification:** Check keyboard/dialog focus, Back/Forward, refresh/tab-close best-effort protection, and 320px/desktop layouts against the running backend. These were not performed in this review; no browser runner was available. Mocked integration tests do not establish native browser behavior.
- **Nonblocking test cleanup:** Dialog prototype methods in `createBand.test.jsx` are assigned directly and are not restored by `vi.restoreAllMocks()`. Prefer spies or explicit descriptor restoration.
- The ticket is marked complete following user acceptance and merge of PR #26. The functional finding, browser verification limitations, and nonblocking test cleanup above remain recorded as follow-ups; merge does not establish that they were resolved or verified.

Ticket 04's add-member form is next in the recommended sequence. Tickets 05–06's Settings operations remain outside this ticket. Phase 2 remains in progress.
