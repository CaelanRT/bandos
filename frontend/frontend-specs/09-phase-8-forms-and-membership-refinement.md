# Phase 8 — Forms and membership refinement

> **Status:** Completed — ticket 01 Completed ([merged PR #55](https://github.com/CaelanRT/bandos/pull/55)); ticket 02 Completed ([merged PR #56](https://github.com/CaelanRT/bandos/pull/56)); ticket 03 Completed ([merged PR #57](https://github.com/CaelanRT/bandos/pull/57)); ticket 04 Completed ([merged PR #58](https://github.com/CaelanRT/bandos/pull/58)); completion confirmed 2026-10-06
> **Source:** [Phase 6 user-testing feedback](feedback/phase6-usertestingfeedback.md) and Grill Me decisions, 2026-10-01
> **Prerequisite:** [Phase 7 shell review](08-phase-7-navigation-and-layout-refinement.md)
> **Behavioral baselines:** [Authentication](02-phase-1-authentication.md) and [Bands and membership](03-phase-2-bands-and-membership.md)

## 1. Goal and boundaries

Reduce distracting form feedback and unnecessary member-add clicks while retaining current authentication, validation rules, and username-based membership behavior. Use the existing warm-paper/oxblood design. No new accounts, invitations, lookup/search, backend changes, or changes to who can add a member are introduced.

## 2. Login feedback and validation

- Remove the expired-session notice and its associated separator. Expiration still clears private state, redirects to Login, and preserves the recognized destination for successful authentication. Keep meaningful logout, deactivation, authentication-completion failure, and server-error feedback.
- Show no field validation on initial render, typing, or blur. Validate all fields only on Submit or Enter. Prevent invalid requests and focus the first invalid field as before.
- After a failed submission, editing a field clears that field's displayed validation error and invalid state; do not revalidate on change or blur. Other field errors remain until edited or the next submission. Clear a stale invalid-credentials message when credentials are edited, while retaining active rate-limit and authentication-completion recovery information.
- Use **Please enter your password** for an empty password and **Invalid email or password** for the API's `INVALID_CREDENTIALS` response. Do not imply the server can identify which credential is wrong.
- Preserve existing email/password rules, normalization, server field-error mapping, pending behavior, duplicate-submission prevention, rate-limit deadlines, and safe destination restoration. Clearing displayed errors must not bypass validation or an active rate limit.

These decisions replace Phase 1's blur/live validation for Login only and its expired-session presentation. Registration's validation timing stays as currently implemented.

## 3. Password visibility and registration hints

Use a shared compact password-visibility control on Login and Registration. Prefer a small eye/eye-off icon adjacent to the input instead of a large secondary button. Its accessible name communicates **Show password** or **Hide password**, its relationship to the input remains explicit, and its touch target and focus indicator remain usable despite the smaller visual footprint. Toggling preserves the password value, never submits the form, and remains disabled during submission.

Remove persistent password character-limit text and any persistent email character-limit text from Registration. The current form has a password hint and no persistent email limit hint; do not add one. Keep existing limits and validation errors when a submission or the existing registration validation behavior requires correction. Preserve the username hint and all other registration fields, autocomplete, and error handling. Remove references to deleted hints from accessible descriptions.

This replaces Phase 1's persistent registration password-length hint without changing password requirements.

## 4. Always-available member addition

For an authorized band leader on Members, show the username input and **Add member** button immediately. Remove the initial reveal button and Cancel button. Keep the input present after successful addition, ready for another username; clear it only after confirmed success using the existing mutation/cache completion flow.

Use **Add band member or user** as the visible input label and retain guidance that the person needs an existing BandOS account and is added by username. The adjacent button uses the existing oxblood styling. Keep the input and button in one compact row where space permits; allow an accessible wrap at narrow widths rather than squeezing either control.

Keep the success message announced and visible, but remove its extra separator. Maintain server errors, already-member/not-found feedback, rate limits, permission refresh, uncertain-outcome reconciliation, duplicate-submission prevention, and cache updates. Do not replace these recovery states with a generic success message.

Ordinary members have no add-member form. If leader access is lost, remove or disable the authorized interaction through existing permission recovery. While pending or reconciling, the input remains visible with the appropriate disabled state and status. Removing Cancel does not remove the unsaved-navigation confirmation for a nonempty draft; retain the existing leave/stay safeguard and creation-intent behavior without needing a reveal step. Do not autofocus the empty form on every background refresh.

## 5. Acceptance criteria

- Session expiration reaches Login silently while preserving private-state cleanup and destination restoration; unrelated notices and errors remain available.
- Login shows validation only after Submit/Enter. Editing clears the edited field's error without live revalidation, and the next submission validates all fields again.
- Empty-password and invalid-credentials copy matches the agreed wording, and error focus/announcement remains accessible.
- Login and Registration share a visually smaller, accessible password toggle that preserves values and pending-state behavior.
- Registration displays no persistent password/email length hints, retains actual limits, and has no dangling accessible hint references.
- Leaders see an input with adjacent **Add member** action immediately, with no reveal or Cancel step; members retain their existing restricted access.
- Confirmed addition keeps the success notice without its extra separator and leaves the form available for another addition.
- Error, pending, permission-loss, uncertain-outcome, rate-limit, cache, and unsaved-navigation behavior remains intact.

## 6. Focused verification and handoff

For later implementation, update Login tests that expect blur/live validation or an expiration notice. Cover Submit and Enter, error clearing on edit, revalidation on resubmit, safe credential copy, and rate-limit preservation. Update relevant password-toggle/registration expectations and member tests that require reveal/Cancel, retaining success, uncertain-outcome, permission, and navigation-protection coverage.

Browser-review Login, Registration, and Members in default, error, pending, and success states at desktop and 320px, with keyboard and zoom. Run relevant tests, lint, build, and whitespace checks. Review this increment before Phase 9; no tickets are created by these specs.
