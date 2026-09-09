# Allow leaders to rename a band through protected Settings

> **Status:** Ready for implementation, subject to dependencies below
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

Leaders can change a band name while members remain in a shared read-only workspace.

## Context

This slice introduces the Settings route and authoritative role gating, with Rename as its first working action.

## In scope

- Leader-only Settings link and guarded direct route.
- Prefilled name form, Save/Cancel, dirty warnings, validation, pending/error states, and same-page success.
- Immediate detail/navigation-name and ordering updates.
- Role revocation, background refresh without overwriting drafts, and uncertain rename reconciliation.

## Out of scope

Deletion until ticket 06, unsupported settings, role-changing UI, and final visual styling.

## Routes and access

`/bands/:bandId/settings` requires leader membership and safe auth-destination recognition. A confirmed member entering directly replacement-redirects to Schedule with a notice. Cancel opens Schedule; selecting any global band always opens that band Schedule even if the destination role is leader.

## API contract

`GET /bands/:bandId` supplies authoritative role/detail. `PATCH /bands/:bandId` with exactly `{ name }` (required trimmed 1–50 characters) → `200 { band }`; refresh detail/list as needed. Handle validation, `LEADER_REQUIRED`, unavailable band, authentication, and uncertain failures.

## Experience and states

Hide management while role is unknown. Save is disabled when unchanged/pending; preserve edited values on refresh/errors. Confirmed success stays on Settings and resets baseline with a notice. Stale-role failure suppresses controls before refresh; if refresh fails keep them suppressed and offer Retry.

## Acceptance criteria

- Settings is absent for members, including direct-entry protection with no management flash.
- New protected route restores safely after authentication.
- Save updates workspace/navigation names and alphabetical position without changing URLs.
- Cancel and band switching enforce dirty Keep/Discard; all band switches land on Schedule.
- Refetch does not overwrite an edited name; unknown role never re-enables denied controls.
- Uncertain rename checks the server name and preserves a conflicting draft for deliberate retry.

## Verification

Test both roles on links and direct URLs, loading-role gating, restore after Login, valid/invalid normalized requests, dirty Cancel/switch/Back, name reordering, stale-response handling, permission changes, expiration, and uncertain rename. Manually check keyboard, focus, long names, responsive layout. Run lint, tests, build.

## Dependencies

[03 — Create a band](03-create-a-band.md), for the reusable dirty-navigation boundary and band form conventions. Ticket 04 is not a blocker.

## Decisions and follow-ups

Ticket 06 adds a separate destructive section. Phase-level checks must verify switching out of Settings for both destination roles.
