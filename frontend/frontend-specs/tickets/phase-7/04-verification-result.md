# Phase 7 shared-shell browser review

Date: 2026-10-02. Base: `origin/main` at `04bdb28`. Merged implementation: [PR #54](https://github.com/CaelanRT/bandos/pull/54). Scope: [ticket 04](04-review-navigation-and-layout.md), [Phase 7 sections 5–6](../../08-phase-7-navigation-and-layout-refinement.md).

**Result: PASS.** The combined shell browser review passed with no demonstrated in-scope defect or unresolved Phase 7 acceptance failure. No application code, dependencies, or duplicate tests were needed. Phase 8's browser-review prerequisite is satisfied. PR #54 merged on 2026-10-02; the project owner confirmed completion on 2026-10-04.

## Browser setup and evidence

Playwright drove the existing Chromium 153.0.8010.12 executable (build 1243) against `npm run dev -- --host 127.0.0.1 --port 5175`. API interception supplied an authenticated Leader, 24 accessible bands with 48-character names containing long unbroken strings, a 40-member Members page, future events, and controlled loading, failure, empty, missing-resource, and Member-permission states. No live backend mutations were performed.

| Browser configuration | Measured layout viewport | Device-pixel ratio | Coverage |
| --- | --- | --- | --- |
| Desktop, 1440×900, 100% | 1440px | 1 | All 12 routes below; keyboard account-menu access; long sidebar and page scrolling |
| Narrow, 320×900, 100% | 320px | 1 | All 12 routes; drawer/menu touch and keyboard journeys; recovery/loading/permission states |
| 1280×900 browser viewport, native 200% zoom | 640px | 2 | All 12 routes; drawer/menu journeys; Account and Members scrolling |

**The 200% pass used native browser zoom**, set through a temporary local extension's `chrome.tabs.setZoom(tabId, 2)` and verified with `chrome.tabs.getZoom() === 2`. This was neither CSS `zoom`, pinch/page-scale emulation, nor just a resized viewport. The tabs-only extension, browser profiles, review driver, screenshots and JSON measurements stayed under `/tmp`; no browser framework or screenshot baseline was added to the repository.

The review recorded **51 passing route/state/journey results**: 36 route/configuration checks, two combined mobile/zoom journeys, ten narrow-screen loading/recovery/permission checks, and three additional menu-dismissal/breakpoint journeys. Selected desktop, narrow drawer, native-zoom drawer/Account, Account bottom, and read-failure screenshots were visually inspected. Final drawer screenshots were captured after the entrance animation finished. Independent review requested clearer Account-bottom evidence: six supplemental geometry checks confirmed the deactivation button and final member fit entirely within the viewport at every configuration. At native 200%, the deactivation button occupies y=381.88–425.88 inside the 450px-high CSS viewport, with the header already above it. A settled CDP capture (`/tmp/phase7-04-native-200-account-bottom-cdp.png`) visibly confirms the control; the original Playwright native-zoom bottom capture was offset and is not used as proof.

Diagnostic artifacts for this session:

- `/tmp/phase7-04-review.mjs`: browser driver; `/tmp/phase7-04-results.json`: measurements and passing results.
- `/tmp/phase7-04-browser.log`: the 36 successful route checks and two combined journeys. Initial driver runs stopped on incorrect or ambiguous test selectors; these were corrected without application changes.
- `/tmp/phase7-04-extra-browser.log`: completed state/dismissal checks, ending `ALL PASSED 51`.
- `/tmp/phase7-04-bottom-review.mjs`, `/tmp/phase7-04-bottom-results.json`, `/tmp/phase7-04-bottom-browser.log`: six passing supplementary viewport-bound checks and direct Chromium captures.
- `/tmp/phase7-04-{desktop,320,native-200}-*.png`: route screenshots, Account/Members bottoms, and settled drawer captures.

Commands used for the browser pass:

```sh
LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node /tmp/phase7-04-review.mjs
EXTRA_ONLY=1 LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node /tmp/phase7-04-review.mjs
LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node /tmp/phase7-04-bottom-review.mjs
```

The second command retained the 38 passing route/journey results and completed the loading/recovery/additional-dismissal checks. The library path uses the already available temporary Chromium audio dependency.

## Authenticated surfaces

Each route was rendered and checked at all three configurations above. On each route the review opened the account menu by keyboard, reached Log out by Tab, dismissed with Escape/focus return, and accessed the complete Datebook/bands/+ navigation (inside the drawer at narrow widths).

| Surface | Route | Checked state |
| --- | --- | --- |
| Datebook | `/` | Future event, Datebook alone selected |
| Band creation | `/bands/new` | Labeled form, styled/current +, discoverable focus label |
| Schedule | `/bands/1` | Future event, parent band selected |
| Members | `/bands/1/members` | 40 members; final member reachable by document scrolling |
| Settings | `/bands/1/settings` | Leader rename/delete sections; parent selected |
| Event detail | `/bands/1/events/1` | Event description; parent selected |
| Event creation | `/bands/1/events/new` | Existing creation form; parent selected |
| Event editing | `/bands/1/events/1/edit` | Loaded existing edit form; parent selected |
| Account | `/account` | Profile, account details and deactivation reachable; Account menu's current-page state |
| Unknown-route recovery | `/unknown` | Shared authenticated shell and Datebook recovery link |
| Invalid-band recovery | `/bands/invalid` | Shared shell and Home recovery link |
| Invalid-event recovery | `/bands/1/events/invalid` | Shared shell, Schedule recovery link, parent selected |

Additional 320px checks covered bands loading → populated, zero bands, bands-read failure → explicit sidebar Retry → populated, unavailable/failed band, missing event, failed initial event-edit read, and Member direct entry to Settings/event creation/editing. Member routes redirected to Schedule or event detail as appropriate; available shell navigation remained usable.

## Phase 7 acceptance evidence

| Approved criterion | Browser evidence / result |
| --- | --- |
| Consistent Datebook/bands/+ and header account access | All listed surfaces use the shared index and right account icon. No Account sidebar duplicate or standalone visible Log out. Menu contains Account and the existing logout action. **PASS** |
| Narrow header and approximately 80%-width drawer | Wordmark hidden in the mobile header; hamburger left, account right. BandOS appears inside the drawer. Measured drawer widths 256px at 320px and 512px at native-zoom 640px. **PASS** |
| Drawer animation, dismissal, focus/background and reduced motion | Left-entry `navigation-enter` animation with dim backdrop; `animationName: none` under reduced motion. Escape, backdrop touch, Close navigation, and destination selection dismiss. Initial focus on Datebook; forward/reverse Tab wrap; `inert` background/header; root overflow locked only while open, restored on dismissal and desktop switch. Dismissal returns hamburger focus; destination navigation focuses main content. Resizing to desktop removes drawer and clears stale open state on return. **PASS** |
| Keyboard/touch menu and meaningful logout recovery | ArrowDown/Enter/Space opening; focused Account item; Tab access to logout; Escape/focus return, outside touch and Tab departure dismiss. Account destination focuses main and identifies its current route. Forced logout failure keeps focused error and Retry visible; explicit retry makes another request and preserves failure recovery. Opening drawer after failure closes account menu. **PASS** |
| Creation and parent-band active states | + remains a link with `create-band-action`, semantic current-page state and solid active outline on `/bands/new`; focus label visible and bottom action reachable after all 24 names. No sidebar structure/dimension collapse. Schedule/Members/Settings/event subroutes retain parent selection; Datebook current only at `/`. **PASS** |
| Ordinary Account/long-page scrolling | Header computed position `static`, main overflow `visible`, and main starts at/below header bottom. Initial document/header top 0. Header scrolls out of view; deactivation and last member reachable. Desktop long sidebar contributes to the single document height; only the open mobile drawer has temporary independent scrolling. **PASS** |
| 320px/200% long names, lists and reachable actions | No document horizontal overflow across 36 route/configuration checks; open drawer has no horizontal overflow. Long names wrap, account panel stays within viewport, all 24 bands and + reachable. Native 200% zoom checked above. **PASS** |
| Preserve routes, access, sessions and unsaved safeguards | Browser checks Member redirects and main-content focus; dirty Create Band and Account navigation offers Keep editing/Discard changes without losing retained input or reopening drawer. Account deactivation dialog opens and cancels with Escape. Existing destination, session, creation-origin and event/form safeguard suites all pass. **PASS** |

## Existing focused regression coverage

The full suite includes the focused implementation-ticket coverage; no duplicate tests were added:

- `bands.test.jsx`: drawer opening/Escape/navigation focus, Tab containment, all dismissals/unmount scroll restoration, breakpoint cleanup/menu exclusivity, Account keyboard/outside/Tab dismissal, logout failure after pending dismissal and retry, parent-band selection and authenticated recovery navigation.
- `createBand.test.jsx`: current + styling/semantics for both trailing-slash forms, preserved Cancel origin, history/SPA/unload guards, mobile dirty-navigation leave/stay/Escape, expiration and late-result safeguards.
- `account.test.jsx`, `deactivateAccount.test.jsx`: entry/return focus without scrolling, unsaved profile navigation, profile/deactivation/session safeguards.
- `sessionAccess.test.jsx`, `sessionLifecycle.test.jsx`: protected-route recovery, expiration, logout deduplication/private-query cleanup and stale-response isolation.
- Existing band/event creation, settings, membership, detail/edit/delete and destination suites retain their permission, mutation and unsaved-navigation coverage.

## Automated verification and audit

- `npm test -- --maxWorkers=2`: **33 files, 396 tests passed**.
- `npm run lint`: **passed**, with the existing `react(set-state-in-effect)` warning at `EditEvent.jsx:41`.
- `npm run build`: **passed**. No separate typecheck script exists.
- `git diff --check`: **passed**.
- Impeccable detector on `src/app/AppShell.jsx`, `src/app/AccountMenu.jsx`, `src/features/bands/BandViews.jsx`, and `src/index.css`: **no findings** (`[]`).

Scoped technical audit: **17/20 (Good)** — accessibility 3, performance 3, responsive behavior 4, theming 3, implementation integrity 4. These are bounded review judgments, not accessibility certification or performance benchmarks. The incumbent warm-paper/oxblood tokens, IBM Plex Sans, focus indicators, semantic active states and shared composition remain coherent. No P0–P3 issue requiring a Phase 7 correction was demonstrated; no redesign or speculative optimization is proposed.

## Limits and handoff

This pass establishes the approved shared-shell behavior in Chromium using controlled frontend/API states. It does not claim live-backend end-to-end success, real-device testing, other-engine compatibility, assistive-technology certification, or real mobile keyboard behavior. Existing integration tests supply session/mutation coverage; these limits are not unresolved failures of the Phase 7 shell review.

The required combined browser-review gate passes. The ticket's review is accepted and Phase 7 is completed; Phase 8 may proceed. Independent `review-ticket` review: **PASS**, no blocking findings. Its non-blocking Account-bottom screenshot clarification was addressed with the six supplemental viewport-bound checks and settled native-zoom CDP capture above. The reviewer independently reran lint, build and whitespace checks successfully.
