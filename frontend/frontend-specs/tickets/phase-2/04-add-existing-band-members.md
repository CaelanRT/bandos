# Add existing users sequentially without leaving Members

> **Status:** For review (2026-09-09)
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

A leader can add everyone in a band quickly while members retain a read-only experience.

## Context

This slice completes the creation-to-members flow and reuses the dirty-navigation guard from creation.

## In scope

- Leader-only Add member trigger/form and one-time automatic opening after creation.
- Trimmed username validation, existing-account guidance, accessible field errors, and pending prevention.
- Immediate deduplicated cache update, success announcement, clearing, and focus for repeated additions.
- Form closing/navigation warnings, stale permission recovery, and uncertain-add reconciliation.

## Out of scope

Invitations, search/autocomplete lookup endpoints, adding unknown/inactive users, batch submission, member removal, or role changes.

## Routes and access

`/bands/:bandId/members`: view for both roles; addition for leaders only. Opening after creation is once-only router state, not durable auto-open behavior.

## API contract

`POST /bands/:bandId/members` with exactly `{ username }` (trimmed 3–50 characters) → `201 { member }`. `GET /bands/:bandId` reconciles membership. Handle `USER_NOT_FOUND`, `USER_ALREADY_IN_BAND`, `VALIDATION_ERROR`, `LEADER_REQUIRED`, `BAND_NOT_FOUND`, expiration, and uncertain failures.

## Experience and states

Normal visits require Add member; creation opens/focuses the form once. After each confirmed success, append/merge by ID, clear input/errors/touched state, keep open/focused, and announce. Unknown/duplicate username keeps input and focuses its inline error. Empty/cleared Cancel does not warn. Lost permission closes mutation UI with an explanation.

## Acceptance criteria

- A leader adds multiple different users consecutively with no reopen click.
- Pending requests cannot overlap; returned members appear once and remain correctly sorted.
- Normal member visits and later refresh do not auto-open the form.
- Members never see addition controls; stale leaders receiving 403 lose them while roles refresh.
- Entered usernames survive correctable/uncertain failures and warn before discard.
- Case-insensitive membership reconciliation reports current membership without falsely attributing it to the failed request.
- Late detail responses cannot erase confirmed additions.

## Verification

Use a journey test adding at least two users sequentially, asserting request bodies, focus, clearing, ordered rows, and no duplicates. Cover normal/post-creation entry, member role, self-add/unknown/conflict, dirty navigation, 403/404/401, failed reconciliation, and stale read races. Manually check keyboard-only sequential use and narrow layout. Run lint, tests, build.

## Dependencies

[03 — Create a band](03-create-a-band.md), providing the origin flow and dirty-navigation boundary.

## Decisions and follow-ups

Only one username request runs at a time. No manual global Refresh action is introduced by error recovery.


## Implementation and verification — 2026-09-09

- Added the leader-only username form and once-only creation handoff. Confirmed additions merge by user ID, retain sorted presentation, announce success, and clear/focus the open form for the next person.
- Added exact trimmed username validation, existing-account guidance, associated field errors, pending prevention, and shared Cancel/navigation/unload protection. Clicking the current Members navigation item preserves the current form; confirmed pending writes resume requested navigation.
- Added permission refresh with immediate control suppression, unavailable-band cache cleanup, expiration handling, and conservative uncertain-outcome reconciliation. Case-insensitive membership matches report current membership without attributing it to the write. Failed/outstanding checks remain required even after closing and reopening the form.
- Confirmed additions cancel older detail reads before merging and revalidating; failed revalidation preserves confirmed data and success. Late responses after logout cannot repopulate private state.
- Added 28 integration cases, including keyboard-driven sequential additions, exact bodies, sorting/deduplication, field/server errors, dirty navigation, permission/access/session failures, stale-read races, and uncertain writes/rechecks. Updated the earlier tickets' assertions to recognize the now-implemented addition controls.

Automated validation: `npm run lint`, `npm test` (267 tests across 18 files), and `npm run build` passed. The UI detector reported no findings for the changed components.

Browser verification remains unverified: no browser runner or installed browser was available in this environment. Check keyboard-only use, native dialog focus and Back/Forward/unload behavior, and 320px/desktop layout against the running backend during review. Mocked integration tests do not establish native browser or live-backend behavior.

Ticket 04 is implemented and awaiting review, not accepted or complete. Tickets 05–06 and the full Phase 2 browser journey remain outstanding.
