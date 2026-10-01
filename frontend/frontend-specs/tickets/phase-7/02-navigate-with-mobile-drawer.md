# Navigate the authenticated app with a mobile drawer

> **Status:** In progress — implementation and independent review passed; Draft PR pending
> **Dependencies:** [Phase 7 ticket 01](01-simplify-navigation-and-account-access.md).

## Objective

Let narrow-screen users open the shared navigation in an accessible left-side drawer.

## Source Specification

[Phase 7 — Navigation and layout refinement](../../08-phase-7-navigation-and-layout-refinement.md), sections 1, 3, and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

The existing narrow-screen BandShell uses a Menu button and expanded band index. Phase 7 replaces that presentation with a modal drawer using the navigation and account menu established in ticket 01.

## Scope

- At the existing narrow-screen breakpoint, put a hamburger at header left and the account icon at right; move the BandOS wordmark into the drawer.
- Animate an approximately 80%-viewport-width drawer from the left with a dimmed backdrop and the same Datebook/bands/+ navigation.
- Implement dismissal, focus containment/return, background interaction prevention, temporary document-scroll blocking, responsive cleanup, reduced motion, and account-menu exclusivity.

## Out of Scope

- Desktop index/account menu composition and active-state correction, owned by ticket 01.
- New navigation destinations, mandatory backdrop blur, and permanent or nested content scrolling.

## Acceptance Criteria

- [x] The default authenticated mobile header has a left hamburger and right account icon without the BandOS wordmark; opening shows BandOS at drawer top-left followed by the shared navigation.
- [x] The approximately 80%-width drawer enters from the left and dims background content, with reduced-motion preferences respected.
- [x] Navigation selection, outside tap, Escape, and the explicit close control dismiss the drawer; unsaved-navigation leave/stay protection still governs route changes.
- [x] Opening moves focus into the drawer, contains keyboard focus, and makes background controls unavailable. Dismissal returns focus to the hamburger; navigation follows existing route-content focus behavior.
- [x] Document scrolling is blocked only while the drawer is open and restored on close/unmount; switching to desktop clears obsolete drawer state.
- [x] Drawer and account dropdown cannot remain open together; triggers retain accessible names, visible focus, and announced expanded states.
- [x] At 320px and 200% zoom, long names/lists and the + remain reachable without horizontal content loss.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Add focused drawer open/dismissal, focus containment/return, navigation focus, background/scroll restoration, responsive cleanup, and menu-exclusivity interaction coverage.
- Retain existing routing and unsaved-navigation tests; update expectations for the replaced Menu presentation.

### Manual / Smoke Verification

- Review touch/outside dismissal, keyboard focus, 320px, 200% zoom, long names/lists, desktop switching, and reduced motion.

### Explicitly Not Required

- Mandatory blur, exhaustive animation timing tests, or a full browser lifecycle simulation.

## Implementation Notes

Reuse ticket 01 navigation content and menu behavior. Keep the existing narrow-screen breakpoint and route-content focus convention. Do not allow the modal scroll lock to become a permanent page-layout rule.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 04 verifies the shared shell before Phase 8 begins.


## Implementation Verification

- `npm test`: 395 tests across 33 files passed.
- Focused `bands.test.jsx` and `createBand.test.jsx`: 75 tests passed, covering drawer dismissal, focus containment/return, route focus, scroll restoration/unmount, responsive cleanup, menu exclusivity, and unsaved leave/stay.
- `npm run lint`, `npm run build`, and `git diff --check` passed. Lint retains the existing `EditEvent.jsx` warning.
- Mocked-API Chromium smoke checks passed at 1440px, 320px, and 640px (200% equivalent reflow), with 24 long band names: touch dismissal, keyboard use, background inertness, temporary scroll lock, reduced motion, desktop switching, route focus, and unsaved-navigation protection.
- Independent `review-ticket` review passed after correcting callback stability for navigation following a logout failure.
- Native browser zoom, real devices, and real-backend checks remain for the combined Phase 7 browser review in ticket 04.
