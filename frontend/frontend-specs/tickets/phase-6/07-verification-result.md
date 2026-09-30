# Phase 6 cross-route verification record

Date: 2026-09-29. Base: `origin/main` at `6606602`. Scope: ticket 07, [Phase 6 sections 3–8](../../07-phase-6-visual-implementation.md). Implementation merged in [PR #50](https://github.com/CaelanRT/bandos/pull/50). Manual testing and Phase 6 sign-off were accepted on 2026-09-30; see the [manual verification and sign-off record](../../phase-6-manual-verification.md).

## Browser coverage and limitations

Headless Chromium 153.0.8010.12 (Playwright's installed Chromium build 1243) rendered the running Vite frontend with intercepted API responses. The fixtures supplied a Leader band, two members, future rehearsal/performance events, account identity, and controlled error/loading/permission states. The browser pass captured route/state screenshots, measured document overflow, inspected visible form labels and control reachability, checked focus outlines, exercised Menu Escape/focus return and native dialog Tab/Escape behavior, and enabled `prefers-reduced-motion: reduce`.

Every route below was rendered at **1440×900**, **320×900**, and **640×900 CSS pixels**. The 640px viewport checks reflow at the effective width of a 1280px desktop window at 200% zoom; it is **not an actual browser zoom test**. Live mutations, real password managers/native mobile keyboards, actual browser zoom, and other engines/devices remain manual checks. Screenshots and temporary audit scripts were kept under `/tmp`; they are diagnostic artifacts, not a permanent screenshot baseline.

| Route checked | Default state / context | Additional 320px browser states |
| --- | --- | --- |
| `/` | Featured and later event rows | No bands, no future events, event-read failure, bands-read failure, delayed events, initial session loading and failed identity restore |
| `/bands/new` | Leader creation form | Empty submission validation; dirty Cancel confirmation |
| `/bands/1` | Populated schedule | Empty events, read failure, Member context, unavailable band, failed band read |
| `/bands/1/members` | Two-member role/name/username index | Leader add-member form |
| `/bands/1/settings` | Rename and delete sections | Member direct-route redirect/notice; band-delete confirmation |
| `/bands/1/events/1` | Populated detail with description | Missing event and event-delete confirmation |
| `/bands/1/events/new` | Empty create form | Validation; Member direct-route redirect/notice |
| `/bands/1/events/1/edit` | Populated edit form | Failed initial event read; Member redirect/notice; dirty Cancel confirmation |
| `/account` | Profile and read-only account details | Deactivation dialog; profile save success; dirty navigation checked separately |
| `/login` | Signed-out labeled form | Empty-submit validation |
| `/register` | Signed-out labeled form | Empty-submit validation |
| `/unknown` | Authenticated recovery | Signed-out recovery |
| `/bands/invalid`, `/bands/1/events/invalid` | Malformed resource recovery at 320px | Correct existing Home/Schedule links |

## Findings and corrections

1. **P1 — Essential control outlines had insufficient contrast.** Shared enabled input/select/textarea/button borders used decorative `--rule` (`#DDD9D1`), with only **1.29:1 against paper** and **1.36:1 against surface**. Empty fields rely on this outline to show their boundary. Added `--control-border: #878178` for the shared control border; decorative row rules retain their own token. Rechecked contrast against both backgrounds and retained explicit error and focus border colors.
2. **P2 — Shared dirty confirmations lacked the Phase 6 presentation.** Band creation/settings/member addition and event create/edit used the shared native dialog without the Account-specific styling. Chromium displayed a white background, 3px black border, and default backdrop. Applied the existing surface/padding/radius/shadow/backdrop language to the common `dialog` rule. Account and destructive dialogs keep their established presentation. No dialog semantics, focus logic, dismissal, or mutation sequencing changed.

## Contrast, semantics, motion and integrity

| Foreground / boundary | Paper `#F7F5F0` | Surface `#FCFBF8` | Use |
| --- | --- | --- | --- |
| Ink `#25231F` | 14.40:1 | 15.16:1 | Body and control text |
| Graphite `#68645D` | 5.40:1 | 5.69:1 | Secondary text, labels and hints |
| Oxblood `#743C32` | 7.92:1 | 8.33:1 | Links, focus and primary actions (reverse ratio for surface text on oxblood) |
| Error `#8D3028` | 7.45:1 | 7.85:1 | Error text and destructive actions |
| Control border `#878178` | 3.54:1 | 3.73:1 | Essential enabled control boundaries |

Ratios use WCAG relative luminance from sRGB tokens. Statuses retain text and semantic `status`/`alert` roles; labels and field-error associations remain in the existing markup. The featured-event secondary text uses light warm text on oxblood, not muted graphite. Disabled opacity and decorative rules were not counted as enabled-control failures. Color transitions are gated by `prefers-reduced-motion: no-preference`; reduced-motion browser measurements reported no enabled interactive transitions. Impeccable's detector on the changed CSS returned no findings. The palette, row/index composition, self-hosted font with fallback, and route-specific hierarchy remain intact; no new dependency, API, permission, route, or state logic was introduced.

## Results and manual sign-off

The route captures showed no document-width overflow at the tested widths, no unlabeled visible form fields, no visible interactive targets below 24px height, and no uncaught page errors. Primary form controls retain their 44px minimum height. Native dialog checks covered initial focus, Tab containment, Escape cancellation and reachable content/actions; Menu Escape returned focus to Menu. These measurements and selected screenshot inspections establish the tested rendering, not exhaustive accessibility certification.

At the time of the implementation audit, outstanding manual checks included actual browser 200% zoom, the complete human keyboard journey, live-backend success/uncertain/rate-limit/session transitions, long-content fixtures, password managers, deployment fallback, and representative other browsers/real mobile devices. On 2026-09-30, the project owner confirmed their manual testing looked good and requested completion. This closes the manual verification gate and completes Phase 6. The [sign-off record](../../phase-6-manual-verification.md) records that confirmation; detailed scenario and browser/device evidence was not supplied. The original automated browser limitations above remain accurate.

## Automated regression checks

- `npm test -- --maxWorkers=2`: **33 files, 382 tests passed**. The initial default-worker run during concurrent browser work had one timeout in the existing `createEvent` permission-recovery test (381 passed); the complete suite passed with two workers. No test or application logic was changed to resolve it.
- `npm run lint`: passed with the existing `react(set-state-in-effect)` warning in `EditEvent.jsx:41`.
- `npm run build`: passed.
- `git diff --check`: passed.
- No new unit/integration tests: fixes change only shared CSS; existing navigation, form and native-dialog behavior stays intact and the browser checks exercise the rendered change.

Independent `review-ticket` review: **PASS**, no blocking or non-blocking findings. Review covered the diff, ticket/specification, surrounding CSS and dialog code, browser measurements/screenshots, and reported automated results. Manual verification was subsequently accepted by the project owner on 2026-09-30, completing the phase.
