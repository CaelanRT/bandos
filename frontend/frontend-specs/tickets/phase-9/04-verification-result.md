# Combined Phase 7–9 frontend review

Date: 2026-10-06. Base: `origin/main` at `04b0a23`. Draft review PR: [#62](https://github.com/CaelanRT/bandos/pull/62). Scope: [ticket 04](04-review-complete-refinement.md), [Phase 7](../../08-phase-7-navigation-and-layout-refinement.md), [Phase 8](../../09-phase-8-forms-and-membership-refinement.md), and [Phase 9](../../10-phase-9-event-experience-refinement.md). Prerequisites: merged implementation PRs [#59](https://github.com/CaelanRT/bandos/pull/59), [#60](https://github.com/CaelanRT/bandos/pull/60), and [#61](https://github.com/CaelanRT/bandos/pull/61); accepted Phase 7 and 8 reviews.

**Combined browser review: PASS.** No demonstrated in-scope defect or unresolved acceptance failure. This ticket records review evidence; no application code, backend changes, dependencies, or duplicate tests were needed.

## Browser evidence

Existing temporary Playwright drivers were reused against the combined current implementation served by `npm run dev -- --host 127.0.0.1 --port 5176`. Chromium 153.0.8010.12 (build 1243) used intercepted API fixtures for authenticated leaders/members, long spaced/unbroken metadata, 24 bands, 40 members, future/started events, and controlled loading, failures, pending requests, permission changes, and session recovery. All drivers, profiles, measurements, and screenshots remain under `/tmp`; no browser framework was added to the repository.

| Configuration | Layout viewport | Zoom evidence |
| --- | --- | --- |
| Desktop, 1440px window | 1440 CSS px | Native zoom 1 |
| Narrow, 320px window | 320 CSS px | Native zoom 1 |
| 1280px window at 200% | 640 CSS px, device-pixel ratio 2 | Temporary tabs-only extension sets `chrome.tabs.setZoom(tabId, 2)` and asserts `chrome.tabs.getZoom() === 2` |

The zoom pass used native browser zoom, not CSS zoom or page-scale emulation. Heights were 900px for shell/forms and 1000px for event drivers; zoom halves the CSS viewport height. Every reviewed route/state checked document overflow; applicable controls and menus remained within the viewport. Drivers recorded no uncaught browser errors. Selected desktop, 320px, and native-zoom screenshots were visually inspected, including drawer, auth forms, member success, Schedule focus, event menu/dialog, timezone rejection, and Account bottom.

**165 passing results** were recorded:

| Driver / artifact prefix | Results | Checked surfaces and states |
| --- | --- | --- |
| `shell` / `phase9-04-shell` | 51 | Twelve authenticated routes at all three configurations; shared sidebar/account menu, parent and Create Band selection; drawer keyboard/touch dismissal, focus containment, inert background, scrolling restoration, breakpoint cleanup, reduced motion; logout failure/retry, dirty Create Band/Account safeguards; loading/empty/read-failure/missing-resource/member recovery |
| `scroll` / `phase9-04-shell-bottom` | 6 | Account deactivation and final member entirely reachable at every configuration; header above viewport, ordinary document scrolling |
| `login` / `phase9-04-forms-01` | 12 | Initial/blur without validation, Enter submission, field correction, pending controls, safe credential error and stale-error clearing |
| `password` / `phase9-04-forms-02` | 24 | Login/Register initial/default/error/pending states, keyboard eye controls, retained password, 44×44px targets and 3px focus outline, absent persistent registration length hints |
| `members` / `phase9-04-forms-03` | 18 | Immediate leader form, dirty leave/stay, pending/disabled, successful addition and reusable form, failed/reconciling states, member restriction |
| `recovery` / `phase9-04-forms-recovery` | 39 | Login/Register destination restoration, rate limits, completion/identity recovery, silent expiration and no replay, unrelated logout/deactivation notices, already-member/permission-loss/rate-limit feedback |
| `rows` / `phase9-04-rows` | 6 | Upcoming/Past full-row hover and equal keyboard background with 3px outline; semantic links, Enter and touch destinations; long metadata/padding containment |
| `detail` / `phase9-04-detail` | 3 | Future/started leaders, member restriction, keyboard/outside menu dismissal, confirmation without immediate deletion, Cancel/Escape focus return, deletion/read failures, Back and long-title wrapping |
| `timezone` / `phase9-04-timezone` | 3 | No creation selector, pristine versus edited Cancel, stable local payload despite changed browser detection, failed detection/retry, hidden-field server rejection alongside visible field errors, retained values/focus, deliberate resubmission |
| `journey` / `phase9-04-journey` | 3 | Actual Datebook → event → Back to band Schedule → event → Edit journey; band tabs/title/Back/facts ordering, stored date, 44px account/cog/Back controls; New York stored Edit zone retained in Tokyo browser; detail recovery repeated |

Native-zoom Account deactivation was fully visible at y=381.88–425.88 in a 450px CSS viewport; the header bottom was -472px. Reduced motion removed drawer animation while preserving opening/dismissal and focus behavior. Touch navigation worked without hover. Direct and Datebook entry both returned to `/bands/2`, rather than browser history. Detail showed `1 October 2099` with `datetime="2099-10-01"`, preserving local times and visible stored timezone.

## Phase 6 feedback accounting

Numbers below identify all **47 checkbox entries in source order** in [the original feedback](../../feedback/phase6-usertestingfeedback.md). Nested details and its timezone test-audit note are included. Approved specifications take precedence over raw suggestions.

| Source entries | Approved outcome and passing evidence |
| --- | --- |
| 1–2: left hamburger; remove mobile header wordmark | Narrow shell uses left hamburger and right account icon; BandOS absent from default mobile header. `shell` route matrix and drawer journeys. |
| 3: drawer wordmark/navigation, left entry, ~80% width, dim background | BandOS at drawer top-left; same primary navigation; 256px/512px drawer at 320px/zoomed 640px; dim backdrop, left-entry animation, reduced-motion alternative, focus containment and all dismissals. `shell`. |
| 4–5: mobile account icon and Account/Log out dropdown | Accessible right icon, expanded state, Account/Log out only; keyboard opening/item access, Escape/focus return, Tab/outside touch dismissal and logout recovery. `shell`. |
| 6–7: remove expiration message and separator | Silent protected-session redirection, no expiration notice; destination restoration/private-state clearing retained. `recovery`, session suites. Other logout/deactivation notices retained. |
| 8: Submit/Enter validation and password messages | No initial/typing/blur Login validation; correction clears only edited errors, resubmit validates again. Empty password: **Please enter your password**. **Invalid email or password** explicitly supersedes suggested password-specific invalid-credential copy. `login`, `recovery`, login suites. |
| 9: smaller Login password control | Shared eye toggle, 44×44px target, focus ring, value retention and disabled pending state. `password`. |
| 10–11: remove Register password/email length text | No persistent password/email length hints or dangling descriptions; username guidance and validation limits remain. `password`, registration suites. |
| 12: smaller Register password control | Same accessible shared eye toggle and pending protection as Login. `password`. |
| 13–17: remove standalone logout; far-right compact account icon/dropdown | Shared shell has no standalone Log out or duplicate sidebar Account; right-aligned account icon and compact dropdown on all authenticated surfaces. `shell`. |
| 18–20: Create Band active indicator and stable navigation | Styled semantic current + on creation route; discoverable focus label, solid oxblood outline and preserved sidebar/drawer dimensions; parent bands remain selected on subroutes. `shell`, Create Band suite. |
| 21–22: Account scrolling and header layout | One document scroll area, no nested main overflow or overlap; all bottom controls reachable. Phase 7 explicitly supersedes the fixed-header suggestion: header is **static, neither sticky nor fixed**, and scrolls away naturally. `shell`, `scroll`. |
| 23: bands-focused Datebook sidebar | Datebook, accessible band index, then +; Account in header. Ordering/loading/empty/failure/retry retained across authenticated routes. `shell`. |
| 24–25: bottom oxblood + and sidebar review | Approved compact + follows all 24 bands, usable focus/touch target and active state; drawer scroll keeps it reachable. Combined desktop/narrow/zoom review completed. `shell`. |
| 26–28: full-row Schedule hover/highlight/click affordance | Full existing Upcoming/Past link including time/title/type/location/padding uses subtle token background; equal keyboard feedback, unchanged destinations and touch operation. `rows`. |
| 29–34: remove reveal; visible labeled input; adjacent accent action; no Cancel; fewer clicks | Leader sees **Add band member or user** immediately with **Add member**, no reveal or Cancel. Approved action wording supersedes Add User; row is adjacent where space permits and wraps at 320px. Existing-account/username guidance and restrictions retained. `members`, `recovery`. |
| 35–36: keep member success without extra separator | Announced success persists, input clears only after confirmed completion, form remains ready; no success separator. Pending/reconciliation/failure/permissions preserved. `members`, membership suite. |
| 37–38: remove manual Create timezone requirement | No creation timezone label/input/datalist/hint; detection required before submission, accessible retry without manual selector or UTC fallback. `timezone`, creation suite. |
| 39–41: retain storage/contracts; browser-derived timezone; compatibility; test audit | Stable browser-derived IANA zone or detected UTC sent in existing required `timezone` alongside local date/time. Edit preserves stored zone/control. Test audit below; frontend-only contract assessment below. `timezone`, `journey`, form/boundary/Edit suites. |
| 42–43: simple left Back and placement | Arrow/Back below title/type/cog, before facts/description; always band Schedule. Approved Phase 9 explicitly puts existing **band tabs above the event area**, superseding the raw placement suggestion; no event tabs introduced. `journey`, detail/navigation suites. |
| 44: day/full month/four-digit year | Stored date rendered directly without viewer-zone day shift; machine-readable date retained. `journey`, boundary tests across west/east/UTC zones and leading-zero years. |
| 45–47: standalone actions → cog with Edit/Delete | Leader-only accessible cog; Edit only before live start cutoff, Delete regardless of start. Edit existing route; Delete confirmation with pending/recovery protections and Schedule return. Members have no cog. `detail`, `journey`, detail/delete/cutoff suites. |

## Timezone audit and required regression evidence

The [ticket 03 audit](03-derive-creation-timezone.md#implementation-verification) was checked against current tests and rerun. Only `createEvent.test.jsx` had manual creation-timezone assumptions; its helper and error expectations now match selector-free creation. Explicit-zone helper/boundary tests remain relevant. Edit still verifies a stored New York timezone in a Tokyo browser and omits it from an unrelated PATCH. Detail/Schedule and affected band/session/destination navigation suites contain no manual creation-selector assumptions.

| Required check | Passing evidence in current suites/browser review |
| --- | --- |
| Known browser zone and UTC payload | `createEvent.test.jsx` parametrized New York/UTC submission; `eventForm.test.js` detection contract; `timezone` browser payload preserves date/time and stable zone |
| Missing/unsupported/throwing detection; retry | Creation parametrized failure tests and helper detection tests; browser blocked submission, retained draft, focused alert and successful retry to visible Date |
| Server hidden-field rejection alongside other errors | Creation rejection test and `timezone` browser check retain Location/Start errors and description, block until retry and never resubmit automatically |
| Once-per-draft/pristine versus dirty | Creation untouched New York/UTC/failure navigation tests; browser detection changed to Tokyo mid-draft but submitted original New York; edited Cancel offers Keep editing |
| Future, real date, same-day end and DST | Creation schedule cases, `eventForm.test.js`, `eventBoundary.test.js`: past/invalid date/end errors, DST gaps rejected and repeated time resolves to earlier occurrence |
| Edit preservation | `editEvent.test.jsx` stored-zone/unrelated PATCH test; `journey` browser timezone control retains New York in Tokyo |
| Date format and Back | Boundary west/east/UTC date cases; detail direct and actual Datebook-entry tests; `journey` actual Datebook Back and stored date assertions |
| Cog, live cutoff, confirmation | Detail keyboard/dismissal/focus/live-cutoff tests; retained Delete pending, permission/session/cache/return tests and Schedule timer tests; `detail`/`journey` browser confirmation/failure checks |

## Frontend-only contract acceptance

This review's diff contains only ticket/review documents. The combined refinements preserve existing routes and event endpoint/payload models: Create sends local `date`, `startTime`, `endTime`, required `timezone`, and existing event fields; unrelated Edit PATCH does not replace timezone. Stored values are not migrated or viewer-converted. Existing leader/member access, live start cutoff, confirmation, session/query cleanup, mutation pending guards and cache ownership are established by passing existing suites and representative browser checks.

The [backend assessment](../../potential-backend-changes.md) remains authoritative: simulated server rejection proves frontend recovery, not a deployed timezone-runtime incompatibility. No reproducible deployed rejection was investigated or demonstrated; no backend prerequisite or change is introduced.

## Verification commands and artifacts

- `npm test -- --maxWorkers=1`: **33 files, 427 tests passed**. Both the restricted and additional unrestricted runs passed (89.82s and 82.28s respectively); quiet per-file reporting prompted the second run.
- Focused regression: **18 files, 268 tests passed** (48.32s), using the command below.
- `npm run lint`: **PASS**, existing `react(set-state-in-effect)` warning at `EditEvent.jsx:41`.
- `npm run build`: **PASS**; no separate typecheck script exists.
- `git diff --check`: **PASS**.
- Impeccable detector on shell/account, Login/Register/password, member addition, Schedule/detail/delete/create and CSS: **no findings** (`[]`).

Focused command:

```sh
npm test -- src/__tests__/createEvent.test.jsx src/__tests__/eventForm.test.js src/__tests__/eventBoundary.test.js src/__tests__/editEvent.test.jsx src/__tests__/eventDetail.test.jsx src/__tests__/deleteEvent.test.jsx src/__tests__/bandSchedule.test.jsx src/__tests__/bandScheduleTimer.test.jsx src/__tests__/bands.test.jsx src/__tests__/createBand.test.jsx src/__tests__/account.test.jsx src/__tests__/sessionAccess.test.jsx src/__tests__/sessionLifecycle.test.jsx src/__tests__/destination.test.js src/__tests__/login.test.jsx src/__tests__/loginFailures.test.jsx src/__tests__/registrationFailures.test.jsx src/__tests__/addBandMember.test.jsx --maxWorkers=1
```

Browser commands all completed successfully, with `LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu`:

```sh
node /tmp/phase9-04-shell.mjs
node /tmp/phase9-04-scroll.mjs
node /tmp/phase9-04-login.mjs
node /tmp/phase9-04-password.mjs
node /tmp/phase9-04-members.mjs
node /tmp/phase9-04-recovery.mjs
node /tmp/phase9-04-rows.mjs
node /tmp/phase9-04-detail.mjs
node /tmp/phase9-04-timezone.mjs
node /tmp/phase9-04-journey.mjs
```

Temporary evidence: the artifact prefixes in the browser table identify `*-results.json`/`*-smoke-results.json`, `*.png`, and browser profiles. Drivers/logs use `/tmp/phase9-04-<driver>.mjs`/`.log`; full/focused test logs use `/tmp/phase9-04-tests.log` and `/tmp/phase9-04-focused-tests.log`; detector output is `/tmp/phase9-04-detector.json`. These are session diagnostics, not durable repository artifacts; this document records their checked states and outcomes.

Scoped technical audit: **17/20 (Good)** — accessibility 3, performance 3, responsive behavior 4, theming 3, implementation integrity 4. This is a bounded review, not accessibility certification or a performance benchmark. Semantic navigation/forms, 44px icon targets, visible focus and alert/status recovery, restrained token-based styling and responsive wrapping remain coherent. No demonstrated in-scope P0–P3 issue required a correction.

## Limits and handoff

Controlled API fixtures and emulated touch establish combined frontend behavior in Chromium. Live backend/storage end-to-end execution, real devices/mobile keyboards, other browser engines and assistive-technology certification were not tested. Deactivation notice presentation uses router state; actual deactivation/session/cache lifecycles remain covered by existing tests. These limits are not unresolved acceptance failures.

No outstanding ticket-required manual checks or in-scope failures remain. Combined review passes; the ticket remains for human review rather than completed. Independent `review-ticket` review: **PASS**, all four acceptance criteria passed, no blocking or non-blocking findings. The reviewer checked the staged diff, ticket/specs/feedback, browser drivers/assertions/logs/results and relevant code/tests; verified full/focused test evidence; and independently reran lint, build and staged whitespace checks successfully.
