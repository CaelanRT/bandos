# Phase 5 critical-flow verification record

## Coverage in this environment

The frontend was audited against the Phase 5 journey using the existing integration suites and targeted code inspection. Vitest with jsdom covers route, state, and keyboard interactions; it does not render a browser layout.

| Journey and transition | Evidence checked |
| --- | --- |
| Login, registration, protected direct URLs, session expiry, logout | `login`, `registration`, `sessionAccess`, and `sessionLifecycle` suites |
| Personal datebook and band navigation | `datebook`, `datebookQueries`, `bands`, and `bandSchedule` suites |
| Members and leader permission changes | `bands`, `addBandMember`, `bandSettings`, and `deleteBand` suites |
| Event detail, creation, editing, deletion, and stale resources | `eventDetail`, `eventBoundary`, `createEvent`, `editEvent`, and `deleteEvent` suites |
| Account profile, deactivation, and unknown routes | `account`, `deactivateAccount`, and `sessionAccess` suites |
| Confirmed profile, band, and event mutations across routes | Cache and navigation assertions in the account, band, datebook query, and event suites |
| Keyboard, labels, focus, dialogs, mobile menu | Existing Testing Library keyboard and focus assertions in the above suites; form and dialog markup inspected |

Direct malformed or unavailable band and event URLs and authenticated and signed-out unknown URLs are covered by the route suites. Stale band access, event deletion, leader permission, and session expiry are covered by targeted state-transition tests. The `editEvent` suite now also checks direct read failure and background event deletion or start while a draft is open.

## Findings fixed

- An initial event-detail read failure on the edit route displayed “Loading event…” indefinitely. The route now offers Retry.
- If a background read found that a drafted event was deleted or had started, the dirty-navigation prompt could obstruct the established event-detail recovery. The route now leaves the unavailable edit and shows its recovery state.

## Outstanding browser verification

No browser executable or browser automation runtime is installed in this environment. A human browser pass is still needed for the complete journey with keyboard-only navigation, direct URLs, a 320px viewport, and 200% zoom. Check that controls remain reachable and dialogs retain usable focus and labels. No additional functional defect was identified by code inspection or automated checks; no cosmetic Phase 6 work was included.

## Automated checks

- `npm test`: 33 files, 382 tests passed.
- `npm run lint`: passed with one existing `react(set-state-in-effect)` warning in `EditEvent.jsx`.
- `npm run build`: passed.
- `git diff --check`: passed.
