# Make Schedule event rows clearly clickable

> **Status:** For Review — [Draft PR #59](https://github.com/CaelanRT/bandos/pull/59); implementation, verification, and independent review passed
> **Dependencies:** [Phase 8 review](../phase-8/04-review-forms-and-membership.md) passed.

## Objective

Give every Upcoming and Past event link clear full-row hover and keyboard-focus feedback.

## Source Specification

[Phase 9 — Event experience refinement](../../10-phase-9-event-experience-refinement.md), sections 1–2 and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

Schedule rows already link to event detail. This ticket improves the link’s visual response without adding event functionality or changing navigation.

## Scope

- Apply subtle hover and equally clear keyboard-focus feedback across the entire event link, including metadata and padding.
- Preserve semantic link behavior, destinations, touch operation, and wrapping long metadata for Upcoming and Past.

## Out of Scope

- Datebook redesign, event-detail controls, creation timezone changes, and new event capabilities.
- Nested interactive controls or click handlers on noninteractive row containers.

## Acceptance Criteria

- [x] Every Upcoming and Past event link highlights its full row on hover, including time, name, type, location, and padding.
- [x] Keyboard focus gives equally clear full-row feedback and retains a visible focus indicator.
- [x] Each row retains one semantic working link to its existing destination; touch navigation works without hover.
- [x] Long metadata wraps without clipping the clickable area, including at 320px and 200% zoom.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Retain `bandSchedule.test.jsx` link/navigation coverage; add a focused interaction assertion only if row structure changes semantic behavior.

### Manual / Smoke Verification

- Browser-review Upcoming/Past rows with mouse, keyboard, and touch at desktop, 320px, and 200% zoom using long metadata.

### Explicitly Not Required

- Automated pixel comparisons or new Datebook styling assertions.

## Implementation Notes

Use `BandSchedule.jsx` and existing row styles in `src/index.css`; preserve schedule grouping/order, read states, destinations, and [Phase 3](../../04-phase-3-band-schedules-and-events.md) event semantics.

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

- Upcoming and Past links share the existing `--faint-rule` background on hover and keyboard focus; the global 3px focus outline remains visible. Row markup and destinations are unchanged.
- `npm test -- src/__tests__/bandSchedule.test.jsx src/__tests__/eventDetail.test.jsx`: **13 tests passed** across two files. Existing navigation coverage retained; no new tests required for this CSS-only change.
- `npm run lint`, `npm run build`, and `git diff --check`: **PASS**. Lint retains the existing `EditEvent.jsx:41` warning.
- Chromium browser smoke: **PASS** for Upcoming and Past at desktop (1440px), 320px, and native 200% zoom (1280px window / 640 CSS pixels), using long spaced and unbroken names/locations.
- Mouse hover and keyboard focus use the same full-link background, including metadata and 14px vertical padding. Tab retains the visible outline; Enter and emulated touch both open each original event destination. One semantic link per row, no nested controls, no clipped metadata or horizontal overflow, and no browser errors.
- Screenshots inspected across all three configurations. Controlled API fixtures and emulated touch were used; real devices, live backend, and other browser engines were not tested.
- Independent `review-ticket` review: **PASS**, all four acceptance criteria passed; no blocking or non-blocking findings.
