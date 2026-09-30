# Phase 6 manual verification and sign-off

> **Status:** Completed — manual testing accepted on 2026-09-30.
> **Implementation PR:** [Merged PR #50](https://github.com/CaelanRT/bandos/pull/50)

The project owner confirmed: “I tested things on my end and they all look good,” and requested that Phase 6 manual testing be marked completed. This closes the manual testing gate and completes Phase 6. No defects or outstanding items were reported. The [audit record](tickets/phase-6/07-verification-result.md) retains the implementation checks and their original limitations.

The procedures below remain a reference for repeating verification. Completion is based on the owner's sign-off. Individual route/state results, browser/device versions, actual zoom measurements, backend version, and screenshots were not supplied; this record does not assert specific platform or scenario coverage.

## Prepare the test environment

1. Use a disposable test account and band on the test backend, with another account that has Member access. Reserve account deactivation and band deletion for disposable fixtures.
2. Install dependencies with `npm ci`. Set `.env` from `.env.example`, with `VITE_API_ORIGIN` pointing at that backend. Start `npm run dev`, or run `npm run build` and `npm run preview` to check the production bundle.
3. Prepare a Leader band with at least two members, future rehearsal and performance events, a past event, and distinct names, dates, locations, and descriptions. Include a long band/event name, long email/username, and a multi-line description. Prepare a second band to exercise switching and partial datebook failures, plus an account with no bands.
4. Record frontend commit, backend environment/version, browser/version, operating system, tester, date, and fixture band/event IDs. Use actual fixture IDs in the routes below.
5. Use DevTools throttling, offline mode, or a test backend's response controls for transient failures. For uncertain writes, allow a write to reach the server before interrupting the response, then restore the connection and inspect server state. Blocking a request before it is sent only tests an ordinary failure. Keep simulated responses identifiable in the evidence.

## Repeatable visual and accessibility pass

Run this pass on **every route in the route table**, including each dialog and representative non-happy state. Desktop target: 1440×900 CSS pixels; narrow target: 320px CSS width. On a desktop window of about 1280px, set **browser zoom to 200% using the browser menu**. Record the resulting `window.innerWidth`. Changing device pixel ratio, pinch zoom, CSS `zoom`, or only setting a 640px viewport is not this browser zoom check.

- Desktop: hierarchy, current band/section, dated schedule rows, member identity/role columns, form groups, and recovery actions are readable and consistent with IBM Plex Sans, warm paper, and oxblood.
- At 320px and actual 200% browser zoom: content reflows without horizontal loss; long strings wrap; primary and recovery actions can be reached by scrolling; dialog content and actions remain reachable. Check date/time controls, timezone suggestions, long validation messages, and multi-line descriptions.
- Keyboard only: reload, use Tab/Shift+Tab and Enter/Space to traverse links and controls in reading order. The skip link reaches main content; focused controls have a visible outline and scroll into view. Open Menu with the keyboard; Escape closes it and returns focus to Menu; selecting a destination closes it and moves focus to its page.
- Dialogs: open with the keyboard, verify initial focus on Cancel or Keep editing (password confirmation may focus its password field), Tab/Shift+Tab remain inside, Escape/cancel preserves the draft, and focus returns to the opener. During a pending mutation, confirm the existing protected dismissal behavior and visible pending message. Discard only when deliberately chosen.
- Forms: each field has a meaningful label; errors name the problem, are associated with the field, and remain readable. Required/optional meaning and read-only account information are clear. Password visibility has an explicit label and works with the keyboard.
- Contrast: inspect text, hints, links, input/select/textarea outlines, enabled button outlines, and focus indicators against their actual backgrounds. Require 4.5:1 for normal text, 3:1 for large text and essential control boundaries. Decorative row rules and disabled controls are not the control-boundary check. Status/error meaning remains understandable without color.
- Target reachability: primary controls offer at least 44px height; inline links remain distinct and easy to activate. Test mobile pointer use, native date/time pickers, on-screen keyboard, and scrolling to actions with the keyboard open.
- Enable the OS/browser reduced-motion preference and reload. Navigation, focus, menus, forms, and dialogs remain usable; the optional link/button color transitions are absent. Also check normal motion once.

## Route and state checklist

The shared visual pass above applies to every row. When repeating this pass, record exercised states and any unavailable scenarios with a reason and follow-up owner.

| Route / surface | States and expected result |
| --- | --- |
| `/` — personal datebook | Populated next event and chronological later events, no duplicated featured event; no bands with Create/share-username guidance; bands without future events; initial loading; whole-read failure with Retry; one failed band with other events still present and an explicit retry. |
| Global navigation / mobile Menu | Home, Create a band, Account, and band links; current destination; loading/failed band list; band switching; Menu open/close/Escape/focus; long band names. |
| `/bands/new` | Empty form, trimmed valid name, blank/too-long validation, pending write, confirmed creation, failure/uncertain creation and Check again; Cancel and dirty-navigation confirmation. Confirm creation leads to Members with add-member intent. |
| `/bands/:bandId` | Upcoming and past grouped rows; empty lists; loading/Retry; Leader/Member action visibility; permission notice; long names/locations; event links. |
| `/bands/:bandId/members` | Names, usernames, roles and ordering; Leader add-member form versus Member read-only view; validation, lookup/conflict failure, pending and success; cancel/dirty draft; list refresh. |
| `/bands/:bandId/settings` | Leader rename, validation, pending, success, conflict/uncertain recovery, dirty navigation; direct Member visit returns to Schedule with permission notice; Delete band dialog and canceled, pending, uncertain, and confirmed outcomes. |
| `/bands/:bandId/events/:eventId` | All detail fields and multi-line description; missing optional description; loading/error/Retry; Leader edit/delete and Member read-only view; past/started event management restrictions; Delete event confirmation, cancel, pending, uncertain and confirmed outcomes. |
| `/bands/:bandId/events/new` | Labeled name/type/date/start/end/timezone/location/optional description; required and invalid time/date/timezone feedback; pending/success; denied and uncertain write recovery; Cancel and dirty dialog; Member direct visit recovery. |
| `/bands/:bandId/events/:eventId/edit` | Current field values, validation, Save/Cancel, pending/success; failed initial read and Retry; changed/deleted/started event while editing; permission loss; uncertain save; dirty dialog. |
| `/account` | Editable names/username versus read-only email/plan; field errors, username conflict, save success, pending/uncertain save and Check again; Cancel and dirty navigation; deactivation warning, password visibility/error, pending/uncertain outcome and successful deactivation on a disposable account. |
| `/login` | Signed-out form, blur/submit validation, password visibility, invalid credentials, rate limit, pending, expired-session/logout/deactivation notices, identity-read Retry, protected destination restoration. |
| `/register` | Form labels/hints, blur/submit validation, password visibility, conflict/rate limit, pending, identity-read recovery; Login link preserves the validated destination; no repeated creation on Retry. |
| Unknown URL, signed in and signed out | Auth-appropriate recovery action and preserved session context; keyboard/zoom/narrow layout. |
| Invalid/unavailable band and event URLs | Malformed ID, deleted resource, and removed membership; clear recovery link; ordinary read failure retains Retry; stale resource recovery does not trap a dirty draft. |
| Initial session restore | Pending identity and failed restore with Retry; retry only identity; no private page flashes before authorization is established. |

## Live journey and browser coverage

- Complete this journey with the test backend: register/log in → datebook → create band → add member → create event → detail → edit event → schedule/datebook refresh → profile save → logout. Confirm visible results persist after reload and across the relevant routes.
- As Member, open Leader-only URLs directly and confirm the existing recovery and notices. With a Leader page open, remove leadership/membership from another session; confirm stale controls do not enable a successful unauthorized write and that recovery is usable.
- Expire the session during an authenticated read and during a write. Confirm Login replaces private content, drafts are cleared as specified, the intended valid destination is restored after login, and the interrupted write is not automatically replayed.
- Exercise slow/error/rate-limit/uncertain outcomes from the route table. Confirm one deliberate write, no automatic write retries, preserved drafts where specified, and explicit read/reconciliation actions before another deliberate attempt.
- Refresh and directly open each recognized route in the **deployed** test frontend. Confirm the hosting SPA fallback serves the app, including unknown URLs; development-server fallback alone is insufficient.
- Check Login/Registration autofill and a password manager, native date/time input and timezone entry, and browser Back/Forward/refresh with unsaved forms. Record any browser-specific limitation of unload prompts.
- Perform the route pass in a current Chromium browser and Firefox; check desktop Safari if available. Check actual Android Chrome and iOS Safari for mobile navigation, dialogs, native inputs, on-screen keyboard, and action reachability. Record unavailable platforms as outstanding rather than claiming coverage. This is representative support verification, not every browser/state permutation.

## Evidence and phase completion

| Evidence | Result | Tester / date |
| --- | --- | --- |
| Project owner's confirmation in this conversation: “I tested things on my end and they all look good.” | PASS — manual testing accepted; no defects reported. | Project owner / 2026-09-30 |
| [Implementation audit and automated results](tickets/phase-6/07-verification-result.md) | Existing verification retained, including recorded warnings and limitations. | Implementation audit / 2026-09-29 |
| [Implementation PR #50](https://github.com/CaelanRT/bandos/pull/50) | Reviewed and merged on 2026-09-29. | GitHub merge record |

- [x] Manual testing completed and results accepted by the project owner.
- [x] No outstanding manual testing defects or follow-up items reported by the project owner.
- [x] Implementation verification retained in the audit record; no application changes made during sign-off.
- [x] Implementation PR is reviewed and merged; ticket 07 is marked Completed.
- [x] Phase 6 marked Completed; PR and evidence links retained.

**Sign-off:** accepted by the project owner on 2026-09-30. Evidence: confirmation recorded above. Outstanding items: none reported. Frontend test commit, backend environment/version, and browser/device details: not supplied.
