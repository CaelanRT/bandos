# Browse the personal datebook

> **Status:** Ready for implementation
> **Specification:** [Phase 4 — Personal datebook](../../05-phase-4-personal-datebook.md), sections 2, 4, and 5

## User/system outcome

A musician can open Home, identify the next event across all bands, scan later work in chronological order, and enter each event in its correct band workspace.

## Context

`/` currently shows an interim bands page. Ticket 01 supplies the cross-band data and partial-failure state; this ticket turns that result into the Phase 4 personal datebook.

## In scope

- Replace the interim home main content with a featured next event shown once and an index of later upcoming events.
- Show stored local date and start time, event name, band name, type, and location on linked entries. Group index transitions by stored local date while preserving actual-start order; use browser-calendar `Today`/`Tomorrow` and full headings otherwise.
- Show initial loading until all band reads settle, a named warning and per-band Retry for partial failures, and a retryable full error if all event reads fail.
- Show `No upcoming events.` and band schedule links when successful results contain no upcoming events, retaining the warning if other band reads failed. Preserve the zero-band Create a band action and username-sharing guidance.
- Update the open page at the next event start and browser-local midnight, and use existing focus revalidation.
- Keep the navigation band list; do not repeat a full band list under a populated agenda. Preserve keyboard access and a direct mobile reading order.

## Out of scope

- Cross-band data composition and recovery owned by ticket 01.
- Event editing, band Schedule changes, a calendar, filters, search, RSVP, pagination, viewer-timezone conversion, and final authored styling.

## Routes and access

`/` remains protected. Each entry links to `/bands/:bandId/events/:eventId`; existing band workspace access and unavailable-event handling apply. A user without a saved destination still arrives at `/` after login.

## API contract

The page consumes ticket 01's joined, validated event and band data. It does not issue a new kind of backend request or mutate events.

## Experience and states

The featured event leads the page; later events remain chronological even when timezone differences make a stored date recur in headings. Compact entries omit timezone and display original local schedule values. Loading waits for the initial requested set. Partial failure leaves successful events usable, names failed bands, and offers targeted Retry; failed bands' cached events remain hidden. An all-failed read is an error, while successful no-upcoming and zero-band outcomes have distinct guidance.

## Acceptance criteria

- [ ] Given upcoming events, the earliest is featured once and all others appear in actual-start order with links into their correct band context.
- [ ] Entries show date, local start time, name, band, type, and location without timezone display or browser-timezone conversion.
- [ ] Index headings follow stored local-date transitions and browser-calendar relative labels, even if a date recurs because timezones interleave.
- [ ] Given pending initial band reads, the page shows loading until they settle; given partial failure, it shows successful events, named warnings, and per-band Retry.
- [ ] Given all event reads fail, the page shows a retryable error rather than an empty-success claim.
- [ ] Given no upcoming events, the page shows the agreed message and band schedule links; given no bands, it retains Create a band and username-sharing guidance.
- [ ] An open datebook advances at the next start and browser-local midnight without polling; focus revalidation still refreshes data.
- [ ] The page's links, warnings, Retry controls, and reading order work by keyboard and at narrow mobile width.

## Verification

### Testing strategy

- **Unit:** date-heading transitions and next-boundary selection only if these are new pure logic beyond Phase 3 utilities.
- **Integration:** featured-once and linked ordering; row fields; loading and partial/all-failure display; empty and zero-band states; start and midnight boundary updates with a controlled clock.
- **Manual/smoke:** Keyboard navigation, long names and locations, and 320px/mobile layout.
- **Explicitly not required:** exhaustive timezone browser journeys, duplicate cross-band aggregation tests from ticket 01, or Phase 6 visual polish.

Run relevant tests, lint, build, and `git diff --check` before independent review.

## Dependencies

[01 — Combine upcoming events across bands](01-combine-upcoming-events-across-bands.md).

## Decisions and follow-ups

The next event appears once. A populated agenda does not repeat the entire band list in main content. Phase 6 owns final visual composition.
