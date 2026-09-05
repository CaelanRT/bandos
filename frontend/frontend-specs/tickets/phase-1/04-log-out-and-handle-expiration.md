# End sessions safely and recover when they expire

> **Status:** Ready for review

## User/system outcome

An authenticated user can deliberately log out, and a user whose session expires is returned to authentication without stale private data or a lost safe destination.

## Context

This final Phase 1 ticket closes the session lifecycle. The cookie is HttpOnly and server-owned, so failed Logout cannot be simulated as success. Expiration may be discovered by any authenticated feature request and must have one application-wide transition.

## In scope

- An accessible Logout action in the minimal authenticated shell.
- `POST /auth/logout` pending, success, and failure behavior.
- One shared `AUTHENTICATION_REQUIRED` transition usable by later API features.
- Clearing the session user and all private query data after successful Logout or detected expiration.
- Preserving a validated current destination only for expiration.
- Contextual one-time Login notices for successful Logout and expiration.
- Failure retry that retains authenticated state.
- Focused lifecycle, routing, and cache tests.

## Out of scope

- Account deactivation or profile controls.
- Cross-tab Logout synchronization.
- Preservation of unsaved protected-form inputs.
- Automatically retrying an interrupted operation after reauthentication.
- General notifications, final navigation, final visual design, or Playwright.

## Routes and access

- Logout is available only in authenticated shell state.
- Successful Logout replacement-navigates to `/login` without a destination and shows `You’ve been logged out.` once.
- Expiration replacement-navigates to `/login` with the current validated protected destination and shows `Your session expired. Log in to continue.` once.
- Successful reauthentication after expiration restores the destination using the existing auth behavior.

## API contract

Call `POST /auth/logout` with no body. The endpoint is backend-idempotent and returns `{ data: { message } }` on success. Do not infer success from a network or server failure.

Any later credentialed request may return `401 AUTHENTICATION_REQUIRED`. The API/session integration must offer a single transition without treating `401 INVALID_CREDENTIALS` as session expiration.

## Experience and states

- Idle: authenticated shell exposes a clear Logout action without implying account deletion.
- Pending: prevent duplicate requests and announce progress without removing authenticated content prematurely.
- Success: clear private state, replacement-navigate to Login, and present the one-time success notice.
- Failure: keep authenticated state and private data, show `We couldn’t log you out. Try again.`, and offer Retry.
- Expiration: clear private state immediately, discard unsaved values, preserve only a safe current destination, and show the contextual Login notice.
- Repeated or concurrent expiration signals must converge on one stable signed-out transition rather than stacking redirects/notices.
- Consumed router-state notices must not replay after refresh.

## Acceptance criteria

- Logout sends no request body and cannot submit twice while pending.
- Successful Logout removes the normalized user and private query data before reaching Login.
- Logout never creates a return destination, and browser Back cannot reopen authenticated content.
- Failed Logout leaves the user authenticated and offers a working retry without claiming success.
- Only `AUTHENTICATION_REQUIRED` triggers expiration; invalid Login credentials do not.
- Expiration clears private data, drops unsaved client form state, and retains only a validated internal URL.
- Login and Registration can restore the expired-session destination after authentication.
- Concurrent expiration reports are idempotent from the user's perspective.
- Logout and expiration messages appear once and refresh does not replay them.
- Keyboard, focus, narrow-width, lint, test, and build requirements pass.

## Verification

- Component tests cover Logout idle/pending/success/failure/retry behavior and request shape.
- Integration-style tests prove private queries and current user are cleared on success but retained on failure.
- Routing tests prove successful Logout has no restoration state and uses replacement history.
- Tests simulate `AUTHENTICATION_REQUIRED` from an authenticated request, including concurrent reports, and verify clearing, message, restoration, and no automatic replay of the interrupted action.
- Tests distinguish `INVALID_CREDENTIALS` from expiration.
- Manually verify keyboard operation, Back/Forward, refresh after each notice, expiration from a deep URL, and narrow mobile behavior.
- Run lint, Vitest, and the production build.

## Dependencies

- Restore authenticated sessions and enforce route access.
- Allow an existing user to log in and resume their work.
- Allow a new user to register and enter Bandos.
- Implemented Logout backend endpoint and shared `ApiError` contract.

## Decisions and follow-ups

Later feature endpoints must route `AUTHENTICATION_REQUIRED` through the shared expiration transition. Cross-tab synchronization and automated replay of interrupted work remain intentionally deferred.
