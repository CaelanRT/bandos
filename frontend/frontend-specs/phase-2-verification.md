# Phase 2 verification record

Updated: 2026-09-14. All six implementation tickets are accepted and merged;
PR #29 completes ticket 06. Phase 2 remains in progress pending the remaining verification.

## Automated verification

- Full Vitest suite: 20 files, 305 tests passed, including 13 deletion tests.
- Oxlint: passed without warnings.
- Production Vite build: passed. No separate type-check script exists.
- `git diff --check`: passed.
- Scoped Impeccable detector: no findings.
- Deletion integration coverage uses the real router, session boundary and Query
  provider with mocked HTTP: named confirmation/Cancel focus and dismissal;
  bodyless single pending request; dirty rename and pending history protection;
  confirmed home replacement and consumed notice; late list/detail/resource reads;
  private resource cleanup with unrelated bands preserved; Back/deep-link access
  recovery; network/server/malformed-response reconciliation and failed rechecks;
  direct/uncertain 404; member gating, stale 403 permission recovery and 401 expiration.

## Native browser checks

Headless Chromium at 320px and 1280px, running Vite with mocked HTTP, passed:

- Native dialog Cancel focus, forward/backward keyboard navigation between actions,
  Escape dismissal and trigger focus restoration.
- 50-character unbroken band name with no horizontal document overflow.
- Dirty rename deletion without a second discard prompt; one bodyless DELETE.
- Home success notice, refresh without replay, and unavailable Settings deep link.
- No browser page errors. Screenshots captured at `/tmp/bandos-delete-320.png`
  and `/tmp/bandos-delete-1280.png` (ephemeral local evidence).

## User-confirmed live checks — 2026-09-14

The user confirms against the running application:

- Account creation, Login, and Logout work.
- Band creation, rename, deletion, and member addition work.
- Regular members cannot see Settings, change details, or delete bands; leaders
  can perform those management actions.

These confirmations establish the reported flows, not every timing, history,
keyboard, or error case below. No repeat of the basic flows is requested.
The agent's earlier live script was blocked by automatic approval review because
it would provision persistent accounts/bands; no agent live test mutations ran.
The user's checks now supply live evidence for the flows listed above.

## Remaining phase closure checks

1. **Creation follow-up — passed:** Merged PR #30 makes the global Create a band
   item non-navigating on both `/bands/new` and `/bands/new/`, preserving the
   original Cancel origin and preventing the same-page dirty-discard regression.
   Regression coverage verifies both route forms.
2. **Sequential additions and creation handoff — passed:** Creation opens Members with the
   add form focused once. Add two users without reopening it; input clears and
   keeps focus, rows appear once, leaders sort first. Revisit Members and confirm
   the creation marker does not reopen the form. Unknown/duplicate/self-add errors
   preserve input and permit correction. These checks were completed successfully.
3. **Cross-session freshness:** Keep a member session open while a leader adds
   them, renames the band, and later deletes it. Returning to the member tab should
   update membership/name/access without manual refresh. An edited rename draft
   must survive background refresh.
4. **Navigation and history:** With at least two bands and different roles, global
   selection always opens Schedule, including from Settings. Names reorder after
   rename; duplicate names remain distinct by destination. A member directly
   visiting a Settings URL returns to Schedule with a permission notice. Check
   direct URL refresh, Back/Forward, creation Cancel origin, and authenticated
   destination restoration after Login.
5. **Unsaved forms and deletion:** For creation, rename, and entered member input,
   Cancel/switch/Back offer Keep editing and Discard changes with the correct
   destination. Refresh/tab close provides browser-controlled best-effort warning.
   Delete Cancel/Escape preserves the band; confirmed deletion discards an edited
   rename without another prompt, returns home, and announces once. After deletion,
   Back, refresh, and old URLs cannot restore either role's band access.
6. **Keyboard and narrow screens:** At desktop and 320px, operate menu, forms and
   dialogs with keyboard only; check focus after closing/navigating, wrapped long
   names, and no horizontal overflow. Include sequential addition and dirty form
   dialogs, which were not all covered by the ticket 06 Chromium smoke check.
7. **Failure/session recovery:** Simulate an expired session while a band form is
   open/requesting: recover to Login without trapping the user or replaying a write.
   Use network throttling/failure simulation to check pending duplicate prevention,
   truthful uncertain-result messaging, Check again after a failed read, and a
   deliberate retry only. Test stale leader permission recovery if a controlled
   backend/test fixture can revoke leadership; no role-changing UI is in scope.

The automated suite already covers error codes and cache races; those do not need
exhaustive manual repetition. The remaining live checks verify integration and
native browser behavior, not a replacement for that suite. Native mobile browsers
and Firefox/Safari remain unverified here; record the browser/device used for live
checks and any accepted coverage limitations.

The last full automated verification was 305 passing tests, clean lint, and a
production build for the merged implementation. Completion edits change only
workflow/verification metadata; no application tests were rerun for this teardown.
After any follow-up code fix, rerun the relevant tests and full phase checks before
marking Phase 2 complete. Earlier ticket records retain historical findings; this
record is the current consolidated verification status.
