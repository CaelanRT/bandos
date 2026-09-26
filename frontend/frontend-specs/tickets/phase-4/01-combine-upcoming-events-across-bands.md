# Combine upcoming events across bands

> **Status:** Ready for implementation
> **Specification:** [Phase 4 — Personal datebook](../../05-phase-4-personal-datebook.md), sections 3 and 5

## User/system outcome

The personal home can obtain one dependable view of upcoming events across the musician's bands while preserving useful results if one band read fails.

## Context

The backend has no user-wide event endpoint. Phase 3 already validates band summaries and event models and caches band event lists; this ticket composes those existing reads for ticket 02's page.

## In scope

- Read the authenticated user's active bands, then request all listed bands' event lists in parallel using the existing API adapters and query keys.
- Wait for the requested reads to settle; join successful events with their band summary; keep only strictly future starts using the existing schedule resolver; order by actual start instant with `bandId`, then `eventId` ties.
- Expose which band reads succeeded or failed so the page can show available results and retry only failed bands. Exclude a failed band's cached events from the current result.
- Treat `BAND_NOT_FOUND` through existing band access removal and list refresh, and let session expiration follow the existing session boundary.
- Recompute from shared band/event caches so confirmed mutations and band removal can update the eventual datebook.

## Out of scope

- Rendering the featured event, index, headings, links, and empty states; ticket 02 owns them.
- A new API endpoint, filters, pagination, polling, mutation behavior, and final styling.

## Routes and access

This data boundary serves protected `/`. Authentication and band membership remain enforced by existing request/session behavior and backend reads. It adds no route.

## API contract

`GET /bands` returns validated active band summaries. For each summary, `GET /bands/:bandId/events` returns all active `Event` models without query parameters. Requests use `credentials: 'include'` through the established client. Standard `AUTHENTICATION_REQUIRED`, `BAND_NOT_FOUND`, malformed-response, and transient read errors retain their current handling.

## Experience and states

The consumer can distinguish initial loading, complete success, partial success, and complete failure after settlement. A failed band contributes no current events, even if its cache has older data. Retrying that band keeps successful data available. An inaccessible band is removed from the candidate set rather than reported as a temporary failure.

## Acceptance criteria

- [ ] Given several bands, their event-list requests start in parallel and the combined result waits for all initial reads to settle.
- [ ] Given events from different timezones, only future starts are included and they are ordered by actual instant, then `bandId` and `eventId` for ties.
- [ ] Given one transient band failure, successful bands' events remain available, the failed band is identified for retry, and its cached events do not enter the current result.
- [ ] Given a retry for one failed band, only that band's event list is retried; successful results remain available.
- [ ] Given `BAND_NOT_FOUND`, existing access removal and band-list refresh exclude that band; authentication expiration still clears private state.
- [ ] Given a confirmed event cache update or band removal, subsequent derived results reflect the shared cache without a separate stale event copy.

## Verification

### Testing strategy

- **Unit:** joining, future filtering, actual-instant ordering, and tie order.
- **Integration:** parallel dispatch and settlement; one failed band with cached data; per-band Retry; inaccessible-band removal; shared-cache update.
- **Manual/smoke:** None required for this data-only ticket.
- **Explicitly not required:** duplicate full session-flow coverage, a new endpoint, or browser lifecycle testing.

Run relevant tests, lint, build, and `git diff --check` before independent review.

## Dependencies

Phase 3's validated event API, schedule resolver, and band-scoped event caches. Ticket 02 consumes this result.

## Decisions and follow-ups

The first combined display waits for all band reads. Transient failure hides that band's cached events and exposes a band-specific retry. User-facing wording and layout belong to ticket 02.
