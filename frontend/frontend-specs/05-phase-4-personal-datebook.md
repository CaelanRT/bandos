# Phase 4 — Personal datebook

> **Status:** Ready for implementation
> **Planning source:** [Frontend implementation plan](00-frontend-implementation-plan.md), Phase 4, and the focused Grill Me session on 2026-09-26
> **Backend authority:** [API contract](../../backend/backend-specs/00-api-contract.md), sections 8.2 and 9.3
> **Existing baseline:** Phase 3 event models, schedule resolution, band/event query keys, protected home route, and band navigation

## 1. Goal and boundaries

Replace the interim bands home with a personal agenda of upcoming events across all of a musician's active bands. The next event is prominent; the remaining events form one chronological index. A failed event read for one band must not prevent useful results from other bands.

This phase does not add a calendar, search, filters, pagination, RSVP, attendance, reminders, notifications, viewer-timezone conversion, or final authored styling. It does not change band schedules or event management.

## 2. Route and access

`/` remains the protected authenticated home and the destination after login without a saved destination. Existing session bootstrap, expiration, and deep-link behavior remain in force. Every datebook event links to `/bands/:bandId/events/:eventId`, where the existing band workspace supplies context and access recovery.

The existing global navigation continues to list bands. The home main content shows band schedule links when there are no upcoming events, rather than repeating a full band list beneath a populated agenda. A user with no bands retains the existing Create a band action and quiet username-sharing guidance.

## 3. Data and state ownership

1. Read `GET /bands` through the established authenticated band query and validated band summaries.
2. Start `GET /bands/:bandId/events` for all returned bands in parallel. Use the existing validated event model and band-scoped event query keys. Do not add API filters or query parameters.
3. Wait for every requested band read to settle before revealing the combined agenda. Loading is explicit while that initial set is pending. Join each successful event with its band summary and keep only events whose timezone-aware start instant is strictly later than now.
4. Sort by actual start instant across bands, earliest first. For an equal instant, use `bandId` and then `eventId` ascending as stable tie-breakers. The first event is the featured next event and appears only once; the index starts with the next event.
5. A transient failure for one band excludes that band's events, including previously cached events, from the current datebook. Show successful bands' events and a compact warning naming each failed band, with Retry for that band alone. Retrying does not clear successful bands' results. When all event reads fail, show a retryable error instead of an empty-success claim.
6. `BAND_NOT_FOUND` means the band is no longer accessible: remove its band-scoped private data using the existing recovery behavior, refresh the band list, and exclude it from the datebook. It does not appear as a transient named failure. Authentication expiration uses the existing session boundary and clears private data.

Remote data belongs to TanStack Query; the datebook derives its joined, filtered, sorted view from those results. Do not copy remote events into durable local state. Preserve the existing conservative read retry policy, immediate staleness, focus revalidation, request cancellation, and mutation cache updates. A confirmed event mutation or band deletion must be reflected through the shared caches without a separate datebook copy becoming stale.

## 4. Presentation and interaction

The page starts with a datebook heading and the featured next event. Both featured and index entries are links and show the stored local date and start time, event name, band name, rehearsal/performance type, and location. Compact entries omit timezone and do not convert schedule values to the browser timezone. The featured entry may use stronger semantic and layout emphasis but does not add unsupported event data.

The index follows actual-start order. Add a heading when the next entry's stored local date differs from the preceding entry's date. Because timezones can interleave, the same date may appear in more than one heading. `Today` and `Tomorrow` refer to the browser-local calendar date, matching the band Schedule; otherwise use a full date heading. Date headings do not change the event's stored date or time. Use unique heading IDs if headings label groups.

When all reads succeed and no upcoming events exist, show `No upcoming events.` with links to the musician's band schedules. If some bands failed and the successful bands have no upcoming events, use the same message beside the named warning, so the incomplete result remains visible. With no bands, show the established zero-band guidance and Create a band action.

An open datebook reclassifies events at the next upcoming start boundary and updates relative headings at browser-local midnight. It also revalidates through existing query focus behavior. Do not poll. Loading, failure, and Retry are visible and keyboard accessible. At narrow widths, preserve a direct vertical reading order: featured event, index, then any useful supporting links or messages.

## 5. Acceptance criteria

- The protected home combines validated events from all active accessible bands using parallel requests and waits for their initial settlement before showing results.
- The next upcoming event is featured once; all later events appear in actual-start order with deterministic ties and correct band-context links.
- Entries show date, local start time, name, band, type, and location without timezone display or viewer-timezone conversion. Index headings follow stored local dates and browser-calendar relative labels.
- A failed band read leaves other successful results usable, hides that band's cached events, names it in a warning, and offers a retry limited to that band. Complete read failure is distinguishable from a successful empty datebook.
- Inaccessible bands are removed through existing band access recovery; session expiration follows the existing signed-out transition.
- Successful zero-event and zero-band states provide the agreed guidance and navigation without duplicating the band list under a populated agenda.
- An open page advances at an event start and browser-local midnight without polling; focus revalidation and existing event mutation caches keep the agenda current.
- The datebook remains readable and operable with a keyboard and at narrow mobile width.

## 6. Focused verification

Use pure tests for cross-band joining, actual-instant ordering and ties, upcoming classification, and date-group transitions. Use representative integration tests for parallel requests with a shared loading phase, correct event links, partial and complete failures, per-band Retry, cached-event exclusion after failure, inaccessible-band recovery, empty states, and start-boundary updates. Reuse existing session and event query coverage rather than duplicating every global flow. Manually check keyboard navigation, long names/locations, and a 320px viewport. Run the repository's relevant tests, lint, build, and whitespace check when implementing the tickets.

## 7. Decisions and deferred work

The next event appears once. The index uses actual-instant order even when this makes the same stored local date recur in headings. Relative headings use the browser calendar. Initial results appear after all band reads settle. Named partial failures have per-band Retry and hide failed bands' cached events. The successful empty state includes band schedule links; a populated datebook does not repeat the full band list. An open page updates at the next event start.

Event detail, band Schedule, account work, and visual implementation remain in their existing phases. Minor copy and layout choices may be made during implementation within these behaviors.
