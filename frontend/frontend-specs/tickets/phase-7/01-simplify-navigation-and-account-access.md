# Simplify authenticated navigation and account access

> **Status:** Implemented — verification and independent review passed; Draft PR pending
> **Dependencies:** Phase 6 completed baseline.

## Objective

Give authenticated users a compact Datebook/band index and a single header menu for Account and logout.

## Source Specification

[Phase 7 — Navigation and layout refinement](../../08-phase-7-navigation-and-layout-refinement.md), sections 1–2, 3 (account dropdown behavior), 4 (active states), and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

`BandShell` currently lists Home, Create Band, and Account and renders a standalone `LogoutButton`; authenticated `AppShell` also exposes logout. `CreateBandLink` becomes a span on its current route, causing the active-control regression.

## Scope

- Apply the simplified navigation to every authenticated shell, including creation, editing, Account, and authenticated recovery routes where navigation is available.
- Show a compact Datebook link, Your bands index, and bottom oxblood + action to the existing Create Band route; remove duplicate Account and old standalone Create Band navigation entries.
- Use a far-right user icon with an Account/Log out dropdown on desktop and mobile, preserving logout recovery.
- Preserve navigation structure and provide semantic, non-color-only current states for Datebook, Create Band, and band subroutes.

## Out of Scope

- Mobile drawer implementation, owned by ticket 02; document-scroll correction, owned by ticket 03.
- New routes, backend changes, product features, and signed-out entry-navigation redesign.

## Acceptance Criteria

- [x] Every authenticated shell exposes Datebook at `/`, the existing ordered accessible band index, and a compact oxblood + linking to `/bands/new`, with no duplicate Account sidebar entry or standalone Logout control.
- [x] The + sits after the band index at the bottom of the sidebar, has an accessible Create a band name, discoverable hover/focus label, and usable touch target; long lists can expand without hiding it or adding an independently scrolling panel.
- [x] The far-right user icon opens Account and Log out; Account reaches `/account`, and logout retains its existing mutation, pending/duplicate guard, private-state cleanup, and visible actionable failure/retry feedback.
- [x] The account menu supports keyboard opening/item access, Escape/outside dismissal, appropriate focus return, visible focus, and an announced expanded state on both desktop and mobile.
- [x] On `/bands/new`, the + remains a styled control with an oxblood active indicator and semantic current-page state without changing sidebar dimensions or structure; creation-origin and return behavior remain intact.
- [x] Datebook is active only at `/`; Schedule, Members, Settings, and event subroutes retain their selected parent band. Active states are identifiable without color alone, and Account is identifiable through its heading/menu.
- [x] Band loading, empty, failed-read, retry, ordering, and destinations remain intact, as do session/access checks and unsaved-navigation safeguards.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Add focused account navigation, menu keyboard/dismissal, logout failure/retry, and Create Band active-control regression coverage. Cover parent-band selection through representative subroutes.
- Reuse relevant `bands.test.jsx`, `createBand.test.jsx`, session lifecycle, creation-origin, and unsaved-navigation coverage rather than duplicating mutation/session scenarios.

### Manual / Smoke Verification

- Review desktop and mobile account menus, long band names/lists, 320px and 200% zoom, keyboard focus, and logout failure visibility.

### Explicitly Not Required

- A replacement session/query layer, duplicated session lifecycle tests, or static visual snapshots.

## Implementation Notes

Preserve IBM Plex Sans, warm-paper surfaces, restrained rules, and oxblood `#743C32`. Relevant boundaries are `BandShell`/`BandLinks`/`CreateBandLink` in `BandViews.jsx`, `AppShell.jsx`, and `LogoutButton.jsx`. Preserve existing session and TanStack Query ownership; this is a navigation composition change. [Phase 1](../../02-phase-1-authentication.md) and [Phase 2](../../03-phase-2-bands-and-membership.md) remain behavioral baselines except for explicit current-phase navigation overrides.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 02 adds the mobile drawer; ticket 04 reviews the complete Phase 7 shell before Phase 8.

## Implementation Verification

- `npm test`: all 391 tests across 33 files pass.
- `npm run lint`: passes with the existing `EditEvent.jsx:41` warning.
- `npm run build` and `git diff --check`: pass.
- Mocked-API Chromium smoke checks pass at 1440px, 320px, and 640px (200% equivalent reflow), covering account keyboard access, Escape/focus return, logout failure/retry, 24 long band names, active Create Band dimensions, and Account navigation. Desktop/mobile screenshots reviewed.
- Independent review using `review-ticket`: PASS, no findings.
- Outstanding phase browser review: native 200% browser zoom and checks against the running backend.
