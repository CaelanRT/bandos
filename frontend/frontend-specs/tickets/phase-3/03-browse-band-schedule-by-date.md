# Browse a band schedule by date

> **Status:** Completed
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

## Independent review blockers — 2026-09-16

The completed implementation did not pass independent review. Resolve and rerun the independent review before creating a Draft PR or moving this ticket to For Review.

- Refresh schedule presentation at the next browser-local midnight so Today, Tomorrow, and Yesterday headings cannot remain stale while the page stays open. Focus revalidation with unchanged event data must also use current browser-calendar time.
- Use unique date-group heading IDs when the same stored date appears in both Upcoming and Past sections (for example, include the section classification in the ID).
- Expand integration coverage to match this ticket’s verification matrix: ordering and backend-order ties; relative headings; initial failure and malformed success payload; inaccessible-band recovery; session expiration; late-read cancellation; focus revalidation; and fake-timer start-boundary movement. Make date/time assertions deterministic with a controlled clock.


## Finalize schedule integration testing

The implementation and baseline checks are complete, but the ticket must not move to For Review until the remaining automated integration coverage below passes and an independent review passes. Keep this work in the existing schedule integration test harness; these are mocked-API and fake-clock tests, not manual browser checks.

- Freeze the browser clock and assert rendered Upcoming/Past date-group and row ordering, including same-date and same-start backend-order ties. Assert Today, Tomorrow, and Yesterday headings from the rendered Schedule without converting stored date/time values.
- With fake timers, mount an already-resolved Schedule just before the next event start; advance across that boundary and assert the row moves from Upcoming to Past without polling or another event-list request. Repeat around browser-local midnight and assert relative headings refresh. Flush the initial render/query work before advancing timers.
- Advance the controlled clock, trigger focus revalidation with a structurally unchanged event response, and assert the rendered classification or relative heading refreshes.
- Hold an event-list response with a deferred mock, leave the Schedule or trigger access/session recovery before resolving it, then resolve it. Assert it cannot restore schedule rows, private event cache, or unavailable band context.
- Keep isolated event-list regressions for BAND_NOT_FOUND and AUTHENTICATION_REQUIRED; do not rely only on concurrent band-detail failures, which can mask an event-query recovery defect.

The separate manual checks remain links, keyboard behavior, long content, 320px/desktop layout, and live boundary behavior. After the automated additions, run npm test, lint, build, and git diff --check, then repeat the required independent ticket review.
