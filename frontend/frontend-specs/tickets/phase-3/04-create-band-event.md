# Create a band event

> **Status:** Ready for implementation
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## User/system outcome

A confirmed band leader can schedule a rehearsal or performance and arrive at its durable detail page.

## Context

Add the first management action only after Schedule and detail are functional. The form must preserve local schedule semantics and handle an inherently unprovable uncertain creation outcome honestly.

## In scope

- One top-level leader-only Create event control and `/bands/:bandId/events/new` route.
- Labeled fields, no initial type/date/time/timezone defaults, native minute-precision date/time controls, shared validation, and accessible searchable timezone entry with manual fallback.
- Readable timezone labels with visible/submitted canonical identifiers; exact normalization/body; dirty navigation and pending protection.
- Confirmed cache seeding/list merge/navigation/status; permission/access/session failures; inline uncertain-outcome schedule review and deliberate warned retry.

## Out of scope

Edit/Delete, duplicate detection, idempotency, automatic timezone selection, overnight/multi-day events, recurrence, attendees, or general form/toast frameworks.

## Routes and access

`/bands/:bandId/events/new` requires a confirmed leader from full band detail. Members are replacement-returned to Schedule with permission feedback. Unknown role exposes no control. Cancel returns to Schedule; successful creation replacement-opens event detail.

## API contract

`POST /bands/:bandId/events` with the exact complete normalized body → `201 { event }`. Description may be omitted or `null`; blank normalizes to `null`. Map recognized validation details to fields. Never automatically retry a mutation.

## Experience and states

No errors appear initially; validate on blur, then while editing, and all on submit with focus on the first invalid field. Confirmed success shows a dismissible status until dismissal/navigation. Permission loss discards the inaccessible draft without prompting. An uncertain response retains all values, checks the list, and displays refreshed schedule context inline; retry warns that a duplicate may result.

## Acceptance criteria

- Members cannot see or directly use creation; stale leader permission suppresses controls and exits safely.
- Every required value is deliberate; timezone search/fallback and backend field errors are accessible.
- The exact request occurs once and rejects invalid/future/DST/same-day schedules before submission.
- Dirty Cancel, links, band switching, Back/Forward, and best-effort unload use the shared boundary.
- Confirmed results win late reads, populate both caches, clear dirty state, and open correct detail.
- No observed duplicate name/schedule is represented as proof of uncertain success.

## Verification

Integration tests cover role/loading/direct access, all validation and field mapping, timezone list/fallback/search, exact body, pending duplicates, dirty navigation, permission/access/expiration, confirmed cache races/status, and uncertain checks/retries/failures. Manually verify native controls, combobox keyboard/screen-reader behavior, history/unload, 320px/desktop, and live creation in multiple timezones. Run lint, tests, build, and whitespace checks.

## Dependencies

[03 — Browse a band schedule by date](03-browse-band-schedule-by-date.md).

## Decisions and follow-ups

The browser timezone catalog is guidance only; backend validation wins. Dismissible status messages do not auto-expire.
