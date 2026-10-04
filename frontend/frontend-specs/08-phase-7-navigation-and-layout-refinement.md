# Phase 7 — Navigation and layout refinement

> **Status:** Completed — ticket 01 [completed in merged PR #51](https://github.com/CaelanRT/bandos/pull/51); ticket 02 [completed in merged PR #52](https://github.com/CaelanRT/bandos/pull/52); ticket 03 [completed in merged PR #53](https://github.com/CaelanRT/bandos/pull/53); ticket 04 [combined browser review](tickets/phase-7/04-verification-result.md) passed and [PR #54](https://github.com/CaelanRT/bandos/pull/54) merged; completion confirmed 2026-10-04
> **Source:** [Phase 6 user-testing feedback](feedback/phase6-usertestingfeedback.md) and Grill Me decisions, 2026-10-01
> **Baseline:** [Phase 6 visual implementation](07-phase-6-visual-implementation.md)
> **Sequence:** Phase 7 → [Phase 8](09-phase-8-forms-and-membership-refinement.md) → [Phase 9](10-phase-9-event-experience-refinement.md)

## 1. Goal and boundaries

Make navigation predictable throughout the authenticated app, simplify account access, and correct layout defects without changing product capabilities. Preserve IBM Plex Sans, warm-paper surfaces, restrained rules, and the existing oxblood accent (`#743C32`).

This phase covers the shared authenticated shell, band navigation, Create Band active state, and Account scrolling. The simplified shell applies throughout the authenticated app, including creation, editing, Account, and authenticated recovery screens where navigation is available. Signed-out entry screens retain their existing navigation purpose.

Existing routes, session handling, query ownership, membership permissions, mutation behavior, and unsaved-change safeguards remain authoritative. No backend changes, new routes, new features, or tickets are included in this planning scope.

## 2. Desktop navigation and account access

- The sidebar contains a compact **Datebook** link to `/`, a **Your bands** index of the current user's accessible bands, and a compact oxblood **+** action at the bottom for the existing `/bands/new` route. Account moves to the header menu; remove its duplicate sidebar entry and the old standalone Create Band navigation entry.
- The + has an accessible name such as **Create a band**, a discoverable hover/focus label, and a usable touch target. Position it after the band index at the bottom of the sidebar, allowing long lists to expand without hiding it or introducing an independently scrolling panel.
- Preserve band ordering, destinations, loading, empty, failed-read, and retry states. The sidebar emphasizes bands rather than unrelated controls.
- Keep account controls at the far right of the header. Replace the standalone Logout button with a compact user icon opening a dropdown containing **Account** and **Log out**.
- Account opens the existing Account route. Log out uses the existing mutation, duplicate-submission guard, session cleanup, and failure/retry behavior. A failure must remain visible and actionable; do not close the only error surface or imply logout succeeded.

## 3. Mobile drawer

At the existing narrow-screen navigation breakpoint, place a standard hamburger icon at the left of the header and the account icon at the far right. Remove the BandOS wordmark from the default authenticated mobile header.

The hamburger opens a drawer from the left, approximately 80% of the viewport width. Show **BandOS** at the top-left inside the drawer, followed by the same Datebook, band index, and Create Band action used on desktop. Use a dimmed backdrop; blur is optional and must not impair performance or readability.

The drawer closes on navigation selection, outside tap, Escape, or its explicit close control. Opening moves focus inside; while open, background controls are unavailable and keyboard focus stays within the drawer. Dismissal returns focus to the hamburger; navigation instead follows existing route-content focus behavior. Block document scrolling only while the drawer is open and restore it on close/unmount. Respect reduced motion, and clear obsolete drawer state when switching to desktop. Keep the account dropdown and drawer mutually exclusive.

The account icon opens the same Account/Log out dropdown on mobile. Both icons have accessible names, visible focus, and announced expanded state. Dropdowns support keyboard opening, item access, Escape dismissal, outside dismissal, and appropriate focus return.

## 4. Active state and document scrolling

Selecting Create Band must preserve the sidebar's dimensions and structure. Its + action retains a visible oxblood active indicator and semantic current-page state on `/bands/new`; a selected control must not become an unstyled span. Preserve the existing creation-origin and return behavior.

Band selection remains visible through its Schedule, Members, Settings, and event subroutes. Datebook is active only at `/`. Account's current route is identifiable through its page heading and account menu rather than a sidebar duplicate. Active states cannot rely on color alone.

Use one normal document scroll area. The header is in document flow and scrolls away naturally; it is neither sticky nor fixed. Account and other long pages expand below it without overlapping it, disappearing behind it, or creating a nested main-content scroll area. This resolves the feedback's broken Account scrolling while superseding its suggestion to keep the header fixed.

## 5. Acceptance criteria

- Every authenticated shell uses the agreed Datebook/bands/+ sidebar and right-aligned account menu, with no standalone Logout or duplicate Account sidebar item.
- At narrow widths, the default header has a left hamburger and right account icon; BandOS appears inside the approximately 80%-width drawer.
- The drawer animates from the left, dims the background, supports all specified dismissal methods, manages focus/background interaction, and respects reduced motion.
- Menus remain operable with keyboard and touch, and logout failures retain meaningful recovery.
- Create Band retains its active indicator without collapsing navigation; band subroutes retain their parent-band selection.
- Account and long pages use ordinary document scrolling with a non-sticky header and no overlap or nested content scrolling.
- At 320px and 200% zoom, long band names, long band lists, menus, and navigation actions remain reachable without horizontal content loss.
- Existing route destinations, access checks, session cleanup, and unsaved-change handling remain intact.

## 6. Focused verification and handoff

For later implementation, add focused interaction coverage for drawer dismissal/focus, account navigation/logout failure, and the Create Band active-state regression. Reuse existing session, creation-origin, and unsaved-navigation coverage. Browser-review desktop and 320px layouts, 200% zoom, long lists/names, Account scroll, keyboard use, and reduced motion. Run relevant existing tests, lint, build, and whitespace checks.

Review this shared shell in the browser before continuing to Phase 8. Phase 7 supersedes only Phase 6's mobile-navigation presentation and earlier global-navigation placement; it preserves the established visual system and functional contracts.
