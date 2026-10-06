# Simplify event details and management controls

> **Status:** For Review — [Draft PR #60](https://github.com/CaelanRT/bandos/pull/60); implementation, verification, and independent review passed
> **Dependencies:** [Phase 8 review](../phase-8/04-review-forms-and-membership.md) passed, including the reviewed Phase 7 menu conventions.

## Objective

Present event title, Back, details, and contextual management in a predictable order without changing event lifecycle rules.

## Source Specification

[Phase 9 — Event experience refinement](../../10-phase-9-event-experience-refinement.md), sections 1, 3, and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

Event detail currently shows raw stored dates and standalone Edit/Delete/Back actions. Band workspace tabs already exist and must remain band navigation rather than become event-specific tabs.

## Scope

- Place title/type and permitted cog first, a left-aligned arrow plus Back next, then event details/description, beneath existing band tabs.
- Replace standalone management controls with an accessible Edit Event/Delete Event cog dropdown using existing permission/cutoff and confirmation flows.
- Format only the event-detail calendar date with numeric day, full English month, and four-digit year.

## Out of Scope

- Event-specific tabs, attendees, new functionality, viewer-timezone conversion, and changes to other date presentations.
- Creation timezone changes, backend changes, permission/lifecycle changes, and direct deletion from a menu item.

## Acceptance Criteria

- [x] Existing permission-aware Schedule/Members/Settings band navigation remains above the event area; inside it title/cog and event-type context precede left-aligned arrow/`Back`, then details/description.
- [x] Back always links to `/bands/:bandId`, including Datebook and direct-URL entry; unavailable-event recovery remains functional.
- [x] Ordinary members have no management cog. Authorized leaders see `Edit Event` only before start and `Delete Event` regardless of start; the existing live edit cutoff prevents stale Edit availability.
- [x] Edit opens the existing edit route. Delete opens confirmation without deleting immediately; dialog handoff/cancel manage focus and preserve pending protection, failure/retry, permission recovery, and return to Schedule after confirmed deletion.
- [x] The cog dropdown follows Phase 7 keyboard opening/item access, Escape/outside dismissal, and appropriate focus-return conventions; standalone Edit/Delete controls are removed.
- [x] Detail dates display, for example, `1 October 2026` from the stored date without a browser-zone day shift, retaining machine-readable `YYYY-MM-DD`, stored local times, and visible event timezone.

## Testing Strategy

### Unit Tests

- Cover stored-date formatting across browser zones without UTC/browser conversion of the calendar date.

### Integration Tests

- Update `eventDetail.test.jsx` for layout/navigation/menu actions; cover Back from Datebook/direct entry, leader/member actions and live cutoff, menu dismissal, and delete confirmation/focus handoff.
- Retain existing `deleteEvent.test.jsx` pending/recovery/cache and schedule cutoff tests rather than duplicating every mutation scenario.

### Manual / Smoke Verification

- Review long event titles, future/started leader views, member views, Back, keyboard cog/dialog operation, and representative failure states at desktop, 320px, and 200% zoom.

### Explicitly Not Required

- New event tabs, exhaustive deletion scenario duplication, or changes to Schedule/Datebook date formatting.

## Implementation Notes

Relevant boundaries are `EventDetail.jsx`, `DeleteEvent.jsx`, `schedule.js`, and the band workspace navigation. Use Phase 7 menu conventions without prescribing a new general abstraction. Preserve [Phase 3](../../04-phase-3-band-schedules-and-events.md) data, permission, query/cache, confirmation, and lifecycle contracts.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 04 reviews all three phases together.

## Implementation Verification

- Event detail retains permission-aware band tabs, then shows title/settings cog and event type, left-aligned arrow/Back, and local details/description. Back always opens the band's Schedule, including Datebook and direct entry.
- Leaders use the keyboard-accessible disclosure for Edit Event before start and Delete Event at any time. A one-shot start-boundary update removes Edit from an open menu and keeps its remaining action focused. Members have no cog.
- Delete still uses the existing confirmation, pending guard, cache updates, permission/session recovery, and return to Schedule. Opening focuses Cancel; cancel/Escape restores focus to the cog. Retained failure feedback spans the title area without forcing overflow.
- Detail dates use full English month names with the original machine-readable date; formatting tests cover western/eastern browser zones, UTC, and stored years with leading zeros. Local times and the visible stored timezone are preserved; Schedule and Datebook formatting is unchanged.
- `npm test -- src/__tests__/eventDetail.test.jsx src/__tests__/deleteEvent.test.jsx src/__tests__/eventBoundary.test.js src/__tests__/bandScheduleTimer.test.jsx src/__tests__/bandSchedule.test.jsx src/__tests__/editEvent.test.jsx`: **45 tests passed** across six files.
- `npm test`: **407 tests passed** across 33 files.
- `npm run lint`, `npm run build`, and `git diff --check`: **PASS**. Lint retains the existing `EditEvent.jsx:41` warning.
- Chromium smoke: **PASS** at desktop (1440px), 320px, and native 200% zoom (1280px window / 640 CSS pixels), including long spaced/unbroken titles, future/started leader and member views, Back, keyboard menu dismissal, emulated touch, confirmation focus/cancel, read failures, and deletion failures/cancelled feedback. No horizontal overflow or browser errors; screenshots inspected.
- Controlled API fixtures and emulated touch were used; live backend, real devices, and other browser engines were not tested. Combined Phase 7–9 review remains ticket 04.
- Independent `review-ticket` review: **PASS**, all six acceptance criteria passed; no blocking or non-blocking findings after preserving leading-zero years.
