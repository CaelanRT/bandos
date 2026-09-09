# Inspect active members in a shared band workspace

> **Status:** Ready for implementation, subject to dependencies below
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
