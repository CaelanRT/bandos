# Phase 8 forms and membership review

Date: 2026-10-06. Base: `origin/main` at `f18a346`. Scope: [ticket 04](04-review-forms-and-membership.md), [Phase 8 sections 5–6](../../09-phase-8-forms-and-membership-refinement.md). Review PR: [merged PR #58](https://github.com/CaelanRT/bandos/pull/58). Implementation prerequisites: merged PRs [#55](https://github.com/CaelanRT/bandos/pull/55), [#56](https://github.com/CaelanRT/bandos/pull/56), and [#57](https://github.com/CaelanRT/bandos/pull/57).

**Combined browser review: PASS.** No demonstrated in-scope defect or unresolved acceptance failure was found. This ticket records verification and handoff; no application changes, dependencies, or duplicate tests were needed. Independent `review-ticket` review: **PASS**, all three acceptance criteria passed with no blocking or non-blocking findings. PR #58 merged and completion was confirmed on 2026-10-06; the Phase 9 review prerequisite is satisfied.

## Browser setup and evidence

Playwright drove the existing Chromium build 1243 against `npm run dev -- --host 127.0.0.1 --port 5175`. Controlled API fixtures supplied signed-out users, authenticated leaders/members, authentication and membership results, delayed requests, and recovery failures. No live backend mutations were performed. Login and Registration used the current shared shell; Members used the reviewed Phase 7 navigation and document scrolling.

| Configuration | Measured CSS viewport | Device-pixel ratio | Surfaces |
| --- | --- | --- | --- |
| Desktop, 1440×900, 100% | 1440×900 | 1 | Login, Registration, leader/member Members |
| Narrow, 320×900, 100% | 320×900 | 1 | Same surfaces; member-add row wraps |
| 1280×900 browser viewport, native 200% zoom | 640×450 | 2 | Same surfaces; controls reachable by document scrolling |

Native zoom used the existing temporary tabs-only extension's `chrome.tabs.setZoom(tabId, 2)` and verified `chrome.tabs.getZoom() === 2`. It was not CSS zoom or page-scale emulation. Profiles, drivers, JSON measurements, and screenshots remained under `/tmp`; no browser automation framework or visual snapshot suite was added.

The completed drivers recorded **93 passing state/configuration results**: 12 Login timing/copy states, 24 shared-control/auth-form states, 18 member-addition/access states, and 39 combined success/recovery states. All measured pages had no horizontal document overflow; auth inputs/buttons fit the viewport width, and password toggles measured at least 44×44 CSS pixels. Member-add input/button bounds were additionally checked vertically after scrolling the row into view at each configuration. No browser page errors were recorded. This count covers review observations, not new repository tests.

Screenshot inspection covered untouched Registration at 320px, desktop Login field errors, native-zoom Registration pending, narrow Members success, native-zoom Members reconciliation with its controls scrolled into view, and silent expiration/recovery. The warm-paper/oxblood presentation, compact eye controls, narrow row wrapping, and success separator removal remain coherent. Registration's keyboard-focused state can show a password error after blur, as its existing validation timing requires; untouched initial captures separately verify the default state.

## Acceptance evidence

| Approved Phase 8 criterion | Fresh browser evidence and existing regression coverage | Result |
| --- | --- | --- |
| Silent expiration; preserve cleanup, destination and unrelated notices | A membership POST returned `AUTHENTICATION_REQUIRED`: Login had no `.auth-notice`, protected controls disappeared, and sign-in restored the complete Members path/query/hash with an empty draft and no mutation replay. Real Logout retained its notice; a router-state fixture retained the deactivation notice. `sessionLifecycle`, `sessionAccess`, and full-suite deactivation coverage verify private-cache cleanup and session boundaries. | PASS |
| Login validates only on Submit/Enter; clear edited errors and revalidate | Typing/blur produced no Login invalid state. Enter on empty fields focused Email and showed both field errors. Editing Email cleared only its error without live validation; Password remained invalid. Corrected Enter submitted once. Existing `login.test.jsx` explicitly covers invalid resubmission and invalid-request prevention. | PASS |
| Agreed copy, accessible error feedback and recovery guards | Empty password displayed `Please enter your password`; failed credentials displayed/focused `Invalid email or password`, cleared on credential edit. A future Retry-After deadline retained its alert through edits and blocked another Enter request. Completion failure retained feedback through edits; identity-read failure showed recovery and keyboard Retry fetched identity without replaying Login. Existing failure suites retain server-field mapping and server-error coverage. | PASS |
| Shared compact password control; values, focus, input association and pending behavior | Both forms' eye controls had Show/Hide password names, `aria-controls` matching the input ID, visible keyboard focus and 44px targets. Space toggles preserved the exact password and made no auth request. Delayed submissions disabled inputs/toggles, then released meaningful server feedback. | PASS |
| Registration hints removed; limits and existing validation retained | Untouched and focused forms have no password/email length hint. Username guidance remains. Password correction references its existing error, not a deleted hint. Existing registration/validation suites cover limits, autocomplete, field-error mapping, blur/live validation and completion recovery. Registration success restored the recognized destination with one creation request. | PASS |
| Leader form immediately available; members restricted | Label/guidance and Add member are visible on entry with no reveal/Cancel. Keyboard Tab reaches the oxblood action with visible focus. The row wraps at 320px. Ordinary-member visits omit both controls; `LEADER_REQUIRED` refresh removes them and displays the permission explanation. Existing suites also cover permission-refresh failure and background role loss. | PASS |
| Confirmed member success retains reusable form and no extra separator | Confirmed addition updates the member list, clears the input, restores input focus and retains announced `@zoe added to the band.` with computed border-top 0. The same form accepts the next attempt. Existing member tests prove two consecutive successful additions and cache completion/race protection. | PASS |
| Pending/error/reconciliation/rate-limit/navigation safeguards | Delayed writes leave disabled visible input and action. Not-found/already-member feedback retains the draft. Uncertain outcomes show disabled controls and Checking band membership, then explicit Try adding again after absence is confirmed. A rate-limited attempt cannot replay on Enter. Dirty Schedule navigation offers Keep editing with retained text and Discard changes with navigation. Existing member/creation/session suites cover failed/found reconciliation, pending navigation, creation-intent focus, background focus preservation, stale results and cache isolation. | PASS |

Both auth forms were reviewed in untouched, keyboard-focused, field-error and pending states, with successful authentication leading to the restored destination rather than a separate success form. Login also has the invalid-credentials state. Members was reviewed in leader default, pending, confirmed success, not-found error, reconciliation and ordinary-member states. Combined recovery checks above ran at all three configurations using Enter, Tab, Space, and keyboard Retry/Logout; pointer selection opened the draft navigation dialog before checking leave/stay behavior.

## Commands and results

```sh
npm test -- src/__tests__/login.test.jsx src/__tests__/loginFailures.test.jsx src/__tests__/loginValidation.test.js src/__tests__/registration.test.jsx src/__tests__/registrationFailures.test.jsx src/__tests__/registrationValidation.test.js src/__tests__/sessionAccess.test.jsx src/__tests__/sessionLifecycle.test.jsx src/__tests__/addBandMember.test.jsx src/__tests__/createBand.test.jsx
npm test -- --maxWorkers=2
npm run lint
npm run build
git diff --check
```

- Focused verification: **10 files, 161 tests passed**.
- Full regression: **33 files, 399 tests passed**.
- Lint: **passed**, retaining the pre-existing `react(set-state-in-effect)` warning at `EditEvent.jsx:41`.
- Production build and whitespace check: **passed**. No separate typecheck script exists.
- Impeccable detector on LoginForm, RegistrationForm, PasswordVisibility, AddBandMember and index.css: **no findings** (`[]`).

Browser commands (each completed successfully):

```sh
LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node /tmp/phase8-04-01-smoke.mjs
LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node /tmp/phase8-04-02-smoke.mjs
LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node /tmp/phase8-04-03-smoke.mjs
LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node /tmp/phase8-04-recovery.mjs
```

Diagnostic artifacts for this session:

- `/tmp/phase8-04-{01,02,03}-smoke-results.json`, `/tmp/phase8-04-recovery-results.json`: 93 passing observations and viewport/control measurements.
- `/tmp/phase8-04-{01,02,03}-browser.log`, `/tmp/phase8-04-recovery-browser.log`: successful configuration/journey output.
- `/tmp/phase8-04-focused-tests.log`, `/tmp/phase8-04-full-tests.log`: automated results.
- `/tmp/phase8-04-*.png`: direct Chromium viewport captures; member-role captures use Playwright screenshots.

Initial browser drivers needed fixture/selector corrections: expose Retry-After to cross-origin browser requests, use the actual Personal datebook heading, and direct Enter to the member input after the leave/stay dialog restores focus to the navigation link. Those were driver issues, not application changes. Final captures separately include untouched auth forms and member controls fully inside the viewport after scrolling.

Scoped Impeccable technical audit: **17/20 (Good)** — accessibility 3, performance 3, responsive behavior 4, theming 3, implementation integrity 4. These are bounded observations, not accessibility certification or performance benchmarks. Shared semantic inputs, meaningful error/status roles, focus styling, existing tokens and compact responsive composition remain consistent. No in-scope P0–P3 issue requiring correction was demonstrated; no speculative redesign or optimization is proposed.

## Limits and handoff

This review establishes the approved combined frontend behavior in Chromium with controlled API fixtures. It does not claim live-backend end-to-end verification, real-device/mobile-keyboard testing, other browser engines, or assistive-technology certification. Deactivation notice presentation used router state; the actual deactivation lifecycle is covered by the existing full test suite. Private query cleanup and less common mutation/cache races are established by existing integration coverage rather than duplicated browser tests.

No unresolved in-scope failures or outstanding ticket-required manual checks remain. The combined increment passes. The review ticket is accepted and Phase 8 is completed; Phase 9 may begin. Independent `review-ticket` review passed. The reviewer inspected the staged diff, applicable code, browser drivers/results and representative screenshots, confirmed the focused/full test results, and independently reran lint, build and staged whitespace checks successfully.
