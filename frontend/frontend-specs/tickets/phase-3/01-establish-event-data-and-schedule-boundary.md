# Establish the event data and schedule boundary

> **Status:** Ready for implementation
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## User/system outcome

Later event screens can trust one validated event model and one consistent interpretation of local date, time, and timezone values.

## Context

The backend deliberately returns separate local schedule fields rather than an absolute instant. This slice establishes the narrow API, cache-key, ID, validation, and schedule seams required by every visible Phase 3 feature.

## In scope

- Strict positive route-ID parsing; validated list/detail/mutation envelopes; duplicate-list and route-identity rejection.
- Band-scoped private list/detail keys compatible with existing session and inaccessible-band cleanup.
- Shared real-date, `HH:mm`, same-day ordering, timezone support, local-to-instant resolution, earlier fall-back occurrence, classification, date grouping, 12-hour formatting, and next-start-boundary calculation.
- Focused pure tests, including DST gaps/overlaps and browser-calendar relative date labels.

## Out of scope

Routes, visible Schedule/detail UI, forms, mutations, new date libraries, viewer-timezone conversion, polling, or backend changes.

## Routes and access

No new route becomes functional. The parser must be usable by targeted event routes without issuing requests for malformed IDs.

## API contract

Prepare adapters for all five event operations and validate the exact normalized models in specification section 6. Calls use `useSession().authenticatedRequest`, abort signals, and existing error/retry conventions. Do not expose mutation controls.

## Experience and states

Not applicable as visible UI. Utilities return controlled failures for malformed models, unsupported timezones, nonexistent local times, and invalid IDs rather than guessing or silently producing empty data.

## Acceptance criteria

- Invalid IDs/models, route mismatches, inactive events, and duplicate IDs are rejected deterministically.
- Schedule resolution preserves stored values, chooses the earlier repeated-time occurrence, and rejects spring-forward gaps.
- Started events classify as Past by start instant; future events classify as Upcoming.
- Group headings use browser-calendar Today/Tomorrow/Yesterday and full dates otherwise without converting event schedules.
- Keys remain removable by Phase 2's band predicate and global private-session clearing.

## Verification

Unit tests cover model/envelope validation, ID grammar, calendar/time validation, end ordering, timezone support, DST transitions, classification, group ordering/labels, timer calculation, and 12-hour formatting. Run focused and full tests, lint, build, and `git diff --check`.

## Dependencies

Implemented Phases 0–2 and the contracted event API. No Phase 3 ticket dependency.

## Decisions and follow-ups

The frontend's earlier-overlap rule is conservative; PostgreSQL lifecycle behavior remains authoritative. Do not add a dependency or absolute schedule model unless the backend contract changes.
