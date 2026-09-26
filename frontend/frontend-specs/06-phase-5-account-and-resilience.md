# Phase 5 — Account and resilience

> **Status:** Ready for implementation
> **Planning source:** [Frontend implementation plan](00-frontend-implementation-plan.md), Phase 5, and the focused Grill Me session on 2026-09-26
> **Backend authority:** [API contract](../../backend/backend-specs/00-api-contract.md), sections 3.1 and 7
> **Existing baseline:** Session boundary, protected routes, band and event access recovery, shared validation, and private query cache

## 1. Goal and boundaries

An authenticated musician can inspect and update the profile fields supported by the API, or deactivate their account with a clear password-confirmed decision. Every supported route has a useful way out when its destination or resource is unavailable. The final functional pass checks critical journeys for stale permission and data, keyboard and focus behavior, and narrow or zoomed layouts.

This phase does not add email, password, or plan changes; account reactivation; a member-removal workflow; new backend endpoints; future modules; or the authored visual system reserved for Phase 6. An audit finding outside functional route recovery, state consistency, accessibility, or responsive usability remains follow-up work unless it blocks a critical journey.

## 2. Account route and navigation

`/account` is a protected, durable route. Replace its current redirect with the account page, and add an Account link to the existing desktop index and mobile menu. Mark it as the active destination when selected. Existing session bootstrap, protected deep links, history, and logout behavior continue to apply.

The page shows the current first name, last name, username, email, and plan from the normalized current-user session. Email and plan are clearly read-only information; no editing affordance is shown for them. Do not show password or account creation timestamp as an editable field. The first name, last name, and username appear in one labeled edit form with explicit Save and Cancel. Cancel discards only the unsaved draft and restores the latest confirmed values on the account page. Normal navigation away from a dirty draft uses the established Keep editing / Discard changes behavior.

## 3. Profile editing

Submit `PATCH /users/me` with only changed, supported fields among `firstName`, `lastName`, and `username`. Trim those fields before validation and submission. First and last names must each be 1–50 characters after trimming; username must be 3–50 characters after trimming. Do not submit an empty object, nulls, email, plan, or unknown properties. Reuse shared validation conventions and show associated field errors near their controls. The server remains authoritative for errors.

On success, normalize the returned current-user object and update the session identity used by the account page, username guidance, and any other current-user display. Reconcile affected band detail/member data so a renamed user is not left with an old name or username in the current workspace. Clear the dirty state and announce the save; no page reload or login is required.

For `ACCOUNT_CONFLICT`, give privacy-safe username feedback without exposing another account. Preserve the draft. Map any returned field details to their corresponding controls; show remaining validation feedback within the form. `AUTHENTICATION_REQUIRED` uses the existing signed-out transition and clears private data. A rate limit gives its message without encouraging immediate retry. On an unexpected or ambiguous save failure, preserve the draft and check `GET /users/me` before offering another save attempt, because the write may have succeeded. If the read confirms the submitted values, accept the server state; otherwise make the difference clear and allow a deliberate retry. If the check fails, offer Check again while keeping another save unavailable. Do not automatically repeat the mutation.

## 4. Account deactivation

The account page offers a separate Deactivate account action. It opens a modal confirmation that names the account and explains that access ends, the user disappears from active band member lists, and existing band and event records remain. It does not promise recovery. The dialog collects the current password, with a visible label and a concealed input, and provides Cancel and Deactivate account actions. Cancel or Escape closes the dialog without changing the account when no request is pending. Focus moves into the dialog and returns to its trigger when cancelled. No typed-name confirmation is needed.

Before sending `DELETE /users/me`, require a non-empty string password; send exactly `{ "password": string }` without trimming or logging it. Prevent duplicate submission and premature navigation while pending. An `INVALID_CREDENTIALS` response keeps the dialog open, preserves a correctable password value, and focuses the password error. Other handled failures appear in the dialog with a usable next step; do not state that deactivation failed if the outcome is uncertain. For an unexpected or ambiguous failure, check `GET /users/me` once to determine whether the account remains active. If authenticated, allow a deliberate retry; if authentication is gone, complete the signed-out transition without claiming confirmed deactivation. If the check fails, offer Check again and keep another delete unavailable. Do not automatically retry the delete.

On confirmed success, clear the session identity and all private query data, then replace-navigate to Login with a brief deactivation notice. Do not preserve `/account` as a post-login destination. The signed-out state must not flash old private content or leave back navigation on an authenticated page. The existing session-expiration handling remains authoritative if the session ends independently.

## 5. Global recovery and state consistency

An unmatched URL shows a useful Not Found page with a route back to the personal datebook for authenticated users, or Login for signed-out users. It must not expose private navigation or content while signed out. Known route patterns with malformed, missing, deleted, or inaccessible band/event IDs keep their existing resource-specific recovery instead of falling through to generic Not Found.

Review the existing critical journey—login or registration, home/datebook, band navigation and members, event detail and management, account, and logout—at the boundaries where session, band access, event existence, or leader permission changes after a screen has loaded. Fix functional gaps found in those boundaries: clear affected private cache and controls, preserve useful unrelated data, give the user an appropriate recovery link or action, and avoid replaying mutations. In particular, a newly inaccessible band must not remain as a usable workspace; a missing event must return to its band Schedule; lost leader access must stop management actions. Preserve the existing server error semantics and feature-specific behavior.

Verify that confirmed mutations and session changes cannot leave contradictory visible identity, permissions, bands, or events across routes. Scope fixes to concrete inconsistencies found by this targeted pass. Do not create a broad new state layer or speculative recovery framework.

## 6. Accessibility and responsive verification

Check the critical journey with a keyboard, visible focus, labels and error associations, confirmation dialogs, and the mobile menu. Check at a 320px viewport and at 200% browser zoom. The account form and dialog, Not Found recovery, and existing critical actions must remain operable without horizontal loss of controls. Fix functional barriers found in these checks within the affected flow. Phase 6 owns final typography, color, decorative composition, and visual polish.

## 7. Acceptance criteria

- `/account` is reachable through global navigation, protected by the session boundary, and displays supported current-user information without implying unsupported edits.
- A musician can save valid changes to first name, last name, and username through one form; only changed supported fields are sent, the returned identity is reflected across current-user surfaces, and Cancel or dirty-navigation recovery behaves predictably.
- Invalid profile values are blocked before the backend gap, server validation and conflict feedback are usable, and ambiguous saves are reconciled without automatic mutation replay.
- A musician can cancel the password-confirmed deactivation dialog, correct a wrong password, and understand the stated effects before confirming.
- Confirmed deactivation removes private state and lands at Login without returning to a protected account page; uncertain outcomes are checked before another attempt or a signed-out claim.
- Unknown URLs offer an auth-appropriate recovery route; known unavailable band/event routes retain their specific recovery.
- The targeted critical-flow pass fixes demonstrable stale permission, deleted-resource, and state-consistency gaps without changing unrelated product behavior.
- Critical flows remain keyboard operable, correctly labeled and focused, and usable at 320px and 200% zoom.

## 8. Focused verification

Use pure tests for trimmed profile validation and changed-field payload selection. Use representative integration tests for account navigation and protection, save and session identity update, field/conflict feedback, ambiguous save reconciliation, deactivation cancellation/wrong-password/success/uncertain result, signed-out cache clearing, unknown-route recovery, and any stale-resource regression actually fixed. Reuse existing session and band/event coverage rather than duplicating every branch. Manually exercise the critical journey with keyboard, 320px viewport, and 200% zoom; record the flows and any findings fixed or deferred. Run the complete relevant test suite, lint, production build, and whitespace check when implementing tickets.

## 9. Decisions and deferred work

The account has one edit form. Email and plan remain read-only. The deactivation warning names the account's access and data effects. The final resilience pass targets known global and stale-resource boundaries, then fixes functional barriers found in the critical journey. Cosmetic redesign remains in Phase 6. Minor copy and layout choices may be made during implementation within these behaviors.
