# Inspect active members in a shared band workspace

> **Status:** Complete (2026-09-09)
> **Merged PR:** [#25 — Implement Phase 2 shared band Members workspace](https://github.com/CaelanRT/bandos/pull/25)
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

Leaders and members can identify who belongs to their band and who leads it.

## Context

This read-only vertical slice provides the destination needed by band creation and subsequent member additions.

## In scope

- Members route and workspace link for both roles.
- Full name, @username, Leader labels, and leaders-first then full-name sorting.
- Loading, empty, failed refresh, inaccessible-band, and session recovery using shared detail data.

## Out of scope

Adding/removing members, invitations, role changes, Settings, and separate member-count/list endpoints.

## Routes and access

`/bands/:bandId/members` is available to authenticated band leaders and members. Global band selection still opens Schedule.

## API contract

`GET /bands/:bandId` returns `{ band }` with active `members`; no separate member-list endpoint exists. Member shape and sorting are in specification sections 4 and 6. Handle shared detail/auth errors.

## Experience and states

Use the existing workspace shell during loading/failure. Empty server membership is a controlled empty state, not fabricated content. Render only server-returned active members; never expose unsupported controls.

## Acceptance criteria

- Both roles see the same member structure and accurate Leader labels.
- Presentation sorts by role, full name, username, then user ID without modifying cached arrays.
- Direct entry, navigation, tab-return freshness, and missing-band recovery work.
- A member sees no Add member or Settings controls.

## Verification

Test both roles, sorting with ties and differing username/name order, empty/error states, direct route/restoration, and inaccessible/expired session recovery. Manually check readable long names, keyboard navigation, and narrow layout. Run lint, tests, build.

## Dependencies

[01 — Navigate bands](01-navigate-band-workspaces.md).

## Decisions and follow-ups

Ticket 04 adds leader controls to this existing shared view; it must not create a separate leader workspace.

## Implementation and verification — 2026-09-09

Implemented and merged in [PR #25](https://github.com/CaelanRT/bandos/pull/25) on 2026-09-09. The implementation used local worktree `/tmp/bandos-phase-2-members` and branch `feat/phase-2-view-band-members`, now removed after merge.

- Added authenticated direct Members entry and working Schedule/Members workspace links for both roles; global band selection continues to open Schedule.
- Reused validated full-band detail data and the shared workspace/query/session boundary for loading, empty membership, initial/background failures, Retry, tab-return freshness, unavailable-band cleanup, and Login restoration.
- Rendered server-returned members with full names, @usernames, and accurate Leader labels. Presentation sorts a copy by role, case-insensitive full name, username, and user ID; cached membership order stays unchanged.
- Full suite: **212 tests pass**, including 33 band integration cases. New coverage exercises both roles, sorting ties and name/username order differences, keyboard navigation, direct routes, re-entry freshness, empty/malformed membership, refresh recovery, missing access, and expiration/restoration on Members.
- Lint, production build, whitespace checks, and the UI mechanical detector pass. Tests and build use `VITE_API_ORIGIN=http://localhost:3000`; the fresh worktree's initial test run lacked that required configuration and was rerun successfully with it set.
- Browser layout, real-browser keyboard interaction, 320px/desktop long-name rendering, and live-backend leader/member checks remain **unverified**. No browser was installed; the temporary Chromium download could not complete within the bounded setup attempt. DOM tests do not establish visual/browser validation. These checks remain visible for review and phase-wide verification.

This ticket is complete following review and merge. Phase 2 remains in progress, with the browser verification limitations above retained for phase-wide verification. Ticket 03 (band creation) is next; member addition and Settings remain in their later tickets.
