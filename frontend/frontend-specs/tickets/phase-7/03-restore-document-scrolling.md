# Restore ordinary scrolling on Account and long pages

> **Status:** Completed — [merged PR #53](https://github.com/CaelanRT/bandos/pull/53), 2026-10-02
> **Dependencies:** [Phase 7 ticket 02](02-navigate-with-mobile-drawer.md), so the final drawer and scrolling rules are verified together.

## Objective

Make Account and other long authenticated pages scroll naturally with the header in document flow.

## Source Specification

[Phase 7 — Navigation and layout refinement](../../08-phase-7-navigation-and-layout-refinement.md), sections 1, 4 (document scrolling), and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

The approved spec resolves the Account scrolling feedback in favor of a non-sticky header and one document scroll area, superseding the feedback suggestion to fix the header.

## Scope

- Correct authenticated shell/page layout so the header scrolls away naturally and long content expands below it.
- Remove layout rules that create overlapping content or nested main-content scrolling while preserving the temporary mobile drawer scroll lock.

## Out of Scope

- Account feature, profile/deactivation, navigation composition, or backend changes.
- Sticky/fixed headers and independent scrolling navigation panels.

## Acceptance Criteria

- [x] Account and other long authenticated pages use one normal document scroll area with a header that is neither sticky nor fixed.
- [x] Content expands below the header without overlapping it, disappearing behind it, or creating a nested main-content scroll area.
- [x] At desktop, 320px, and 200% zoom, long page content and navigation remain reachable without horizontal content loss.
- [x] The mobile drawer still blocks document scrolling only while open and restores normal scrolling on close/unmount.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Retain relevant Account and shell interaction coverage; add a focused interaction test only if the layout fix changes behavior.

### Manual / Smoke Verification

- Browser-review Account profile/deactivation sections and representative long pages at desktop, 320px, and 200% zoom; scroll from top to bottom and open/close the drawer on a long page.

### Explicitly Not Required

- Static CSS assertion tests or automated visual snapshots for the scrolling fix.

## Implementation Notes

Inspect shared `.band-shell`, `.workspace-header`, main-content, and Account layout in `src/index.css` and the associated shells. Preserve the existing visual tokens and Account behavior. Browser verification is the primary proof of this presentation fix.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 04 records the complete shell review.

## Implementation Verification

- The shared shell already uses an in-flow header, naturally expanding content, and document scrolling. Route-content focus now uses `preventScroll`, preventing the browser from automatically scrolling the header out of view when Account mounts. Keyboard focus remains on the main content.
- Focused Account, deactivation, shell, and creation tests: 91 passed, including the new Account entry/return focus regression check and existing drawer close/unmount scroll restoration coverage.
- Full `npm test -- --maxWorkers=2`: 396 tests across 33 files passed.
- `npm run lint`, `npm run build`, and `git diff --check` passed. Lint retains the existing `EditEvent.jsx` warning.
- Mocked-API Chromium checks passed on Account and a 40-member Members page at 1440px, 320px, and 640px (200% equivalent reflow), with 24 long band names. Verified entry at document top with a visible header; header/main non-overlap; ordinary document scrolling with no nested main scroll area; bottom content and navigation reachability; no horizontal content loss; drawer scroll locking and restoration after dismissal.
- Native browser zoom, real-device, and real-backend checks remain for the combined shell review in ticket 04.
- Independent `review-ticket` review: PASS, no findings.
