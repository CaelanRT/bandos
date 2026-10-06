# Derive Create Event timezone from the browser

> **Status:** Implemented — verification and independent review passed; Draft PR pending
> **Dependencies:** [Phase 8 review](../phase-8/04-review-forms-and-membership.md) passed.

## Objective

Remove manual timezone selection from Create Event while sending a validated browser-derived zone with the existing local schedule payload.

## Source Specification

[Phase 9 — Event experience refinement](../../10-phase-9-event-experience-refinement.md), sections 1, 4, and 5–6; [backend assessment](../../potential-backend-changes.md), sections 1–3. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

Create Event currently starts with an empty timezone, presents an input/datalist/hint, and compares its draft against `emptyEventValues`. Creation and Edit share event form helpers, so removing creation controls must preserve Edit’s stored timezone behavior.

## Scope

- Resolve and validate the browser timezone once per creation draft, remove creation selector UI, and retain the required timezone payload.
- Treat automatic initialization as pristine and preserve user-edit unsaved protection.
- Provide accessible form-level detection/server-rejection recovery without guessing a zone, losing a draft, or resubmitting.
- Audit affected tests and preserve schedule/DST validation and Edit’s timezone control.

## Out of Scope

- Manual creation selector, UTC fallback, offsets/UTC conversion, geolocation, band/location-based inference, and other creation defaults.
- Edit timezone-control removal, stored event timezone replacement, new endpoints/schema/storage, and speculative backend compatibility work.

## Acceptance Criteria

- [x] Create Event has no timezone label/input/datalist/selection hint; it resolves `Intl.DateTimeFormat().resolvedOptions().timeZone`, validates with the current frontend contract, and sends the supported zone in the existing required `timezone` field.
- [x] Date/time remain local calendar values without UTC conversion or zone-to-offset substitution. Detected `UTC` is valid; failed detection never silently substitutes UTC.
- [x] The timezone initializes once and stays stable while filling the draft; opening an otherwise untouched form does not trigger a leave warning, while user edits retain existing protection.
- [x] Missing, unsupported, or throwing detection retains the draft, blocks submission, and shows an accessible form-level explanation with `Retry timezone detection`, without a manual selector or focus on an absent field.
- [x] Server rejection of the derived timezone appears at form level with the same recovery action while retaining other field errors; retry neither automatically resubmits nor discards values or silently changes the schedule.
- [x] Future-start, same-day end, real-date, and DST validation continue using the derived zone; schedule field errors remain beside visible date/time controls and server validation remains authoritative.
- [x] Edit retains its current timezone control and stored value and never implicitly overwrites it from the editor’s browser; endpoint/payload schema, storage, permissions, cache ownership, and lifecycle rules remain intact.

## Testing Strategy

### Unit Tests

- Cover supported browser-zone detection including UTC and missing/unsupported/throwing outcomes at the narrowest deterministic boundary.
- Retain event-form/boundary date, future-start, same-day end, and DST validation coverage; update only creation-specific assumptions.

### Integration Tests

- Before editing, audit `createEvent.test.jsx`, `eventForm.test.js`, `eventBoundary.test.js`, `editEvent.test.jsx`, `eventDetail.test.jsx`, `bandSchedule.test.jsx`, and affected navigation tests for manual creation-timezone assumptions.
- Cover known browser zone in payload, UTC, failed detection/retry, hidden-field server rejection with other field errors, stable initialization, initial pristine versus edited drafts, and preservation of values/no automatic resubmission.
- Keep Edit timezone and schedule/DST coverage; reuse existing mutation/permission/cache tests rather than duplicating them.

### Manual / Smoke Verification

- Review successful creation and detection/server-rejection recovery at desktop, 320px, and 200% zoom; inspect visible field focus and unsaved-navigation behavior.

### Explicitly Not Required

- Backend timezone compatibility changes without a demonstrated rejected valid browser zone, timezone-support API, or duplicate coverage of every event mutation failure.

## Implementation Notes

Inspect `CreateEvent.jsx`, `eventForm.js`, `schedule.js`, and `EditEvent.jsx`. [Phase 3](../../04-phase-3-band-schedules-and-events.md) remains the behavioral baseline except for Create-only manual selection and nondefaulted timezone. [API contract §9.1–9.2](../../../../backend/backend-specs/00-api-contract.md) still requires local date/time plus UTC or a supported IANA-style zone. Device timezone while travelling is explicitly accepted; no location inference is needed. Keep creation pristine-baseline and hidden-field error handling separate from Edit behavior where necessary.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 04 reviews the complete frontend increment. Investigate backend compatibility only if the assessment’s reproducible rejection trigger occurs.


## Implementation Verification

- Create Event resolves and validates the browser zone for the draft, removes its timezone selector, and preserves the required timezone plus local date/time payload. Automatic detection and retries do not make an otherwise untouched form dirty.
- Detection failures and server timezone rejection use a focused form-level alert with Retry timezone detection. Submission remains blocked until detection is retried successfully; retries preserve entered values and other field errors, focus the visible Date control, and do not submit automatically.
- Test audit: only `createEvent.test.jsx` entered a manual creation timezone. Its shared fill helper and timezone error expectations were updated. `eventForm.test.js` and `eventBoundary.test.js` retain explicit-zone schedule/real-date/DST coverage; `editEvent.test.jsx` now explicitly proves a stored New York zone survives a Tokyo browser and is omitted from an unrelated PATCH. `eventDetail.test.jsx`, `bandSchedule.test.jsx`, `bands.test.jsx`, `sessionAccess.test.jsx`, and `destination.test.js` have no manual creation-timezone assumptions and remain unchanged.
- Relevant command: `npm test -- src/__tests__/createEvent.test.jsx src/__tests__/eventForm.test.js src/__tests__/eventBoundary.test.js src/__tests__/editEvent.test.jsx src/__tests__/eventDetail.test.jsx src/__tests__/bandSchedule.test.jsx src/__tests__/bands.test.jsx src/__tests__/sessionAccess.test.jsx src/__tests__/destination.test.js`: **146 tests passed** across nine files.
- `npm run lint`, `npm run build`, and `git diff --check`: **PASS**. Lint retains the existing `EditEvent.jsx:41` warning.
- Chromium smoke: **PASS** at desktop (1440px), 320px, and native 200% zoom (1280px window / 640 CSS pixels), including successful creation, stable zone/local payload, untouched versus edited Cancel navigation, detection failure/retry, server timezone rejection with other field errors, visible focus, preserved drafts, and no automatic resubmission. Screenshots inspected; no horizontal overflow or browser errors.
- Controlled API fixtures and browser detection outcomes were used; live backend, real devices, and other browser engines were not tested. Combined Phase 7–9 review remains ticket 04.
- Full suite: `npm test -- --maxWorkers=1`: **427 tests passed** across 33 files. Initial parallel full runs had intermittent failures in unchanged membership/session/account navigation tests; the original membership/session failures passed an isolated 42-test rerun. Untouched `origin/main` passed its 407-test full suite. No unrelated tests were changed or weakened.
- Independent `review-ticket` review: **PASS**, all seven acceptance criteria passed; no blocking or non-blocking findings. Reviewer independently reran the 146 focused tests and whitespace check.
