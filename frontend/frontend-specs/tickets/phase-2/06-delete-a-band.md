# Delete a band with confirmation and consistent access recovery

> **Status:** Ready for implementation, subject to dependencies below
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

A leader can remove a band from everyone’s normal workspace and return home with clear feedback.

## Context

This final recommended slice completes Settings and deletion-related cache/access behavior. It also provides a place to record the phase closure verification once all tickets are implemented.

## In scope

- Separate Delete section and accessible named confirmation with Cancel/Delete band.
- Pending protection, confirmed-success cache cleanup, home navigation, and one-time notice.
- Uncertain deletion reconciliation, stale permissions, and missing-band recovery.
- Phase closure verification record after all six tickets are implemented.

## Out of scope

Typed-name confirmation, hard deletion, recovery/reactivation UI, deletion of user accounts, and automatic mutation retries.

## Routes and access

Delete is available only to leaders at `/bands/:bandId/settings`; confirmed success replacement-navigates to `/`. Former members/leaders subsequently receive unavailable-band recovery for all band routes.

## API contract

`DELETE /bands/:bandId` with no body → `200 { message }`; read detail/list to reconcile uncertain results. `LEADER_REQUIRED`, `BAND_NOT_FOUND`, expiration, and network/server/malformed-success errors use specification sections 7–8. Backend soft-deletes the band; memberships/events stay stored but become inaccessible.

## Experience and states

Use the exact named-target confirmation from the specification, initially focus Cancel, and restore trigger focus on dismissal. Pending action cannot repeat. Confirmed success clears band data/context, updates home/list, and announces once. An uncertain 404 establishes unavailability, not proof this deletion succeeded. Retry requires deliberate confirmation.

## Acceptance criteria

- Members never receive Delete UI and direct Settings access remains gated.
- Cancel/Escape preserve the band; pending confirmation prevents duplicate bodyless requests.
- Confirmed deletion clears detail and associated private band resources before home arrival.
- In-flight reads cannot resurrect the deleted band; browser Back cannot recover cached access.
- Confirmation covers discarding an unsaved rename; no second dirty prompt occurs after deletion.
- Failure recovery retains truthful state and never auto-repeats deletion.
- A phase verification record distinguishes automated results, browser checks, and any outstanding checks.

## Verification

Test dialog focus/Cancel, pending, success/one-time notice, cache cleanup and late reads, Back/deep-link recovery, dirty rename deletion, 403/401, and ambiguous deletion with successful/failed rechecks. Run full lint, tests, build. Once all tickets are done, perform the complete real-browser leader/member journey and keyboard/narrow-width checks in specification section 10; record results without claiming unavailable checks passed.

## Dependencies

[05 — Rename through Settings](05-manage-band-name.md). Ticket 04 is not required to implement deletion, but all tickets 01–06 must pass before phase closure.

## Decisions and follow-ups

Future events/datebook must use compatible band-scoped cache removal. Do not mark Phase 2 complete until sequential additions and all other phase acceptance checks are verified.
