# Browse a band schedule by date

> **Status:** Ready for implementation
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## User/system outcome

Current members and leaders can scan a band's upcoming and past events and open their durable details.

## Context

Replace only the Phase 2 Schedule placeholder. This slice establishes the event list query, working links to ticket 02's detail route, and live start-boundary behavior without exposing unfinished management actions.

## In scope

- `GET /bands/:bandId/events`, list-query freshness/retry/cancellation, and validated cache storage.
- Expanded Upcoming and Past sections grouped by stored date; browser-calendar relative headings and full dates.
- Linked rows showing start time, name, type, and plain-text location only.
- Independent empty states, initial loading/failure, cached background warning/Retry, inaccessible-band/session recovery, focus revalidation, and one-shot boundary reclassification.

## Out of scope

Create/Edit/Delete controls, personal datebook aggregation, filtering, pagination, calendar UI, polling, timezone display in rows, or final styling.

## Routes and access

`/bands/:bandId` remains protected and member-scoped. A malformed band ID issues no band/event request. Rows link to the functional `/bands/:bandId/events/:eventId` route.

## API contract

`GET /bands/:bandId/events` with no query → `200 { events: Event[] }`. Use ticket 01 validation/keys and existing authentication, unavailable-band, malformed-success, and conservative retry behavior.

## Experience and states

Both sections remain visible and expanded. Empty success differs from failure. Leaders and members see the same event data; no management control appears. Cached rows survive background failure with a compact warning, while no-cache failure uses a retryable full Schedule error.

## Acceptance criteria

- Events classify by timezone-aware start, not end or browser-local date, while preserving backend order within groups.
- Upcoming dates run earliest first; Past dates run newest first; row dates are not repeated.
- Relative headings depend on the browser calendar but never convert stored schedules.
- The next future start triggers one reclassification without polling; focus also revalidates.
- Empty, loading, malformed, transient, inaccessible, and expired-session states remain truthful and safe.

## Verification

Integration tests cover both roles, grouping/order/ties, headings, row fields/omissions, empty sections, initial/background failures, Retry, malformed payloads, access loss, expiration, late reads, focus, and fake-timer movement. Manually verify links, keyboard use, long content, 320px/desktop layout, and boundary behavior. Run lint, tests, build, and whitespace checks.

## Dependencies

[02 — Inspect durable event details](02-inspect-event-details.md).

## Decisions and follow-ups

Past stays expanded and uses no pagination. One top-level Create location is reserved for ticket 04; empty states do not duplicate it.
