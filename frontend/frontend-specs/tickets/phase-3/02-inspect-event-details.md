# Inspect durable event details

> **Status:** Completed
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## User/system outcome

A current band member or leader can open a durable event URL and understand its complete user-facing local schedule.

## Context

This slice replaces the temporary event redirect with a targeted detail query and neutral recovery. It establishes the page where later leader actions appear, without displaying dead controls.

## In scope

- Protected detail route, strict IDs, validated detail query/cache, refresh, cancellation, and list/detail reconciliation.
- Event name/type plus separately labeled Date, Start time, End time, Timezone, Location, and optional Description.
- Plain-text location, omitted empty Description, explicit Back to Schedule, loading/error/unavailable/access/session states.
- Start-boundary lifecycle advice for later controls, while showing no unfinished Edit/Delete UI.

## Out of scope

Schedule-list implementation, Create/Edit/Delete behavior, creator identity, internal/audit fields, map links, viewer-timezone conversion, attendance, or final styling.

## Routes and access

`/bands/:bandId/events/:eventId` requires authentication and current band access. Malformed and unavailable event IDs both show `This event is no longer available.` with Back to Schedule; malformed IDs issue no event request. Preserve deep-link restoration, query/hash, refresh, and history behavior.

## API contract

`GET /bands/:bandId/events/:eventId` → `200 { event: Event }`. Validate route identities and use specification section 8 for missing band/event, expiration, transient failure, and malformed success.

## Experience and states

The page remains in the band workspace. The complete local schedule is readable without browser-timezone conversion. A missing Description creates no empty section. Useful cached detail survives background failure with contextual Retry.

## Acceptance criteria

- Direct, refreshed, Back/Forward, and restored-auth entry resolve the durable route.
- Visible values match the approved hierarchy and omit IDs, creator, active state, and audit timestamps.
- Missing/malformed/cross-band events reveal no distinction and cannot retain stale cache data.
- Member and leader pages are identical until later tickets add functional leader actions.
- The explicit Schedule link provides deterministic recovery independent of browser history.

## Verification

Integration tests cover direct entry, both roles, every displayed/omitted field, null description, long location, cached refresh failure, invalid IDs, wrong identities, unavailable/access/expiration transitions, query/hash/history, and late reads. Manually verify semantics, keyboard navigation, narrow layout, and live deep links. Run lint, tests, build, and whitespace checks.

## Dependencies

[01 — Establish the event data and schedule boundary](01-establish-event-data-and-schedule-boundary.md).

## Decisions and follow-ups

Ticket 03 makes these durable pages discoverable from Schedule rows. Leader actions appear only when their implementing tickets land.
