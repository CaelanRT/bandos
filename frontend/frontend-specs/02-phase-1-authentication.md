# Phase 1 — Authentication

> **Status:** Ready for implementation
> **Phase outcome:** Users can register, log in, restore sessions, follow protected links, and log out.
> **Discovery source:** Phase 1 Grill Me session, 2026-09-03
> **Governing plan:** [`00-frontend-implementation-plan.md`](00-frontend-implementation-plan.md)
> **Backend contract:** [`../../backend/backend-specs/00-api-contract.md`](../../backend/backend-specs/00-api-contract.md)

## 1. Goal

Turn the Phase 0 skeleton into a session-aware application. A returning user can restore an existing cookie session without seeing the wrong screen, a signed-out user can create an account or log in, protected deep links survive authentication, and an authenticated user can log out without leaving private client state behind.

Phase 1 establishes authentication behavior, not the final application experience. The authenticated root remains a minimal destination until the personal datebook is implemented.

## 2. Non-goals

Phase 1 does not implement:

- password recovery, email verification, password changes, or email changes;
- remembered-login controls, social login, invitations, or onboarding;
- band, event, datebook, or account screens;
- populated global navigation or the final visual system;
- cross-tab session synchronization, session polling, or focus-based session refetching;
- persistence of auth form values or unsaved protected-form values across navigation;
- a general notification/toast framework;
- Playwright or a full first-release browser journey.

Do not render controls or copy that imply these capabilities exist.

## 3. Routes and access

### Public and signed-out-only routes

- `/login` and `/register` are available only while signed out.
- An authenticated user who enters either route is replacement-redirected to `/`.
- Login and Registration link to each other using normal push navigation and retain a valid intended destination.

### Protected routes

The approved application routes are protected:

```text
/
/bands/:bandId
/bands/:bandId/members
/bands/:bandId/events/new
/bands/:bandId/events/:eventId
/bands/:bandId/events/:eventId/edit
/account
```

A signed-out user entering one of these routes is replacement-redirected to Login with the complete internal path as the intended destination. While later feature pages remain unfinished, authenticated entry to those routes follows the Phase 0 temporary behavior and replacement-redirects to `/`.

The catch-all remains publicly reachable and renders the minimal not-found result. Phase 5 owns its authored experience.

### Destination restoration

- Preserve path, query string, and hash for a recognized internal application destination.
- Carry the destination in React Router navigation state, not a URL parameter or persistent browser storage.
- Preserve it when moving between Login and Registration.
- After successful Login or Registration, replacement-navigate to it.
- Accept only recognized same-application routes. Reject absolute URLs, protocol-relative URLs, auth routes, malformed values, and unknown paths; use `/` as the fallback.
- Registration restores the destination even when the new user may not be authorized for it. The destination feature owns its eventual inaccessible-resource behavior.
- Successful Logout goes to `/login` without a restoration destination.

## 4. User flows

### Initial session bootstrap

1. On each full application load, request `GET /users/me` once.
2. Until it settles, show a full-page neutral `Loading Bandos…` status. Do not render Login, navigation, or protected content underneath it.
3. A valid user establishes the authenticated state.
4. `AUTHENTICATION_REQUIRED` establishes the signed-out state.
5. Any other failure leaves authentication unknown and shows a full-page connection failure with Retry. Retry calls only `/users/me`.

Do not poll, refetch on focus, or independently infer session state from the cookie. Later authenticated API calls returning `AUTHENTICATION_REQUIRED` remain authoritative expiration signals.

### Login

1. The user enters email and password.
2. Client validation runs according to the form behavior in this specification.
3. Submit `POST /auth/login` once.
4. On success, fetch `GET /users/me`; do not derive identity from the authentication message.
5. Store the normalized user in session state and replacement-navigate to the restored destination or `/`.

### Registration

1. The user enters first name, last name, username, email, and password.
2. Client validation runs according to the form behavior in this specification.
3. Submit `POST /auth/register` once.
4. On success, fetch `GET /users/me`; do not derive identity from the authentication message.
5. Store the normalized user in session state and replacement-navigate to the restored destination or `/`.

Registration has no confirm-password field. Both auth forms provide an accessible Show/Hide password control that preserves the value.

### Authentication succeeds but identity retrieval fails

Do not resubmit Login or Registration. The backend may already have created an authenticated cookie session.

- A non-authentication `/users/me` failure moves to the full-page connection failure while retaining the intended destination. Retry calls only `/users/me`.
- An `AUTHENTICATION_REQUIRED` response returns to the originating auth form with contextual completion-failure feedback.
- Refreshing the page runs normal bootstrap and can recover a server-created session.

### Session expiration

When any authenticated request returns `AUTHENTICATION_REQUIRED`:

1. clear the current user and all private query data;
2. replacement-navigate to Login with the current recognized internal URL;
3. show `Your session expired. Log in to continue.`;
4. restore the destination after a successful Login or Registration.

Do not retain unsaved form values across this transition and do not automatically repeat the failed operation.

### Logout

- Prevent duplicate Logout submissions while `POST /auth/logout` is pending.
- On success, clear the current user and all private query data, then replacement-navigate to `/login` with `You’ve been logged out.`
- On failure, retain the authenticated state and present `We couldn’t log you out. Try again.` with a retry action. The frontend cannot clear the HttpOnly session cookie and must not pretend Logout succeeded.

## 5. Component responsibilities

The implementation should provide these responsibilities without requiring these exact component names or file boundaries:

- A session boundary owns bootstrap status, the normalized current user, authenticated/signed-out transitions, and explicit identity refresh after authentication.
- Route access boundaries render only after bootstrap resolves and enforce protected versus signed-out-only access.
- A destination utility validates, carries, and resolves internal restoration targets consistently for both auth forms.
- Login and Registration each own their fields, touched state, client/backend errors, pending state, and focus behavior.
- A shared password-visibility control provides equivalent keyboard and assistive-technology behavior in both forms.
- A full-page session status surface represents bootstrap loading, connection failure, and retry.
- Logout owns its pending and failure presentation but delegates successful session clearing to the session boundary.

Avoid a general form framework, global state library, or notification system for this phase.

## 6. API interactions and normalized models

### `GET /users/me`

- Called once on full application load, explicitly after Login/Registration, and when the user chooses Retry after identity retrieval fails.
- Successful `{ data: { user } }` responses use the Phase 0 current-user normalizer.
- `401 AUTHENTICATION_REQUIRED` means signed out or expired.
- Other failures do not establish a signed-out state.

The session user remains:

```text
userId, username, firstName, lastName, email, plan, isActive, createdAt
```

### `POST /auth/login`

Request body contains only:

```json
{
  "email": "alex@example.com",
  "password": "correct horse battery staple"
}
```

Expected handled errors are `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, and `INTERNAL_ERROR`.

### `POST /auth/register`

Request body contains only:

```json
{
  "username": "alex",
  "firstName": "Alex",
  "lastName": "Rivera",
  "email": "alex@example.com",
  "password": "correct horse battery staple"
}
```

Expected handled errors are `VALIDATION_ERROR`, `ACCOUNT_CONFLICT`, `TOO_MANY_ATTEMPTS`, and `INTERNAL_ERROR`.

### `POST /auth/logout`

Send no body. Success is idempotent at the backend. A frontend failure does not establish that the server session was destroyed.

### Rate-limit metadata

The API client must make a valid `Retry-After` value available to auth features without coupling presentation to raw response objects. Support the HTTP-date and delay-seconds forms when practical. Invalid or absent values remain unknown rather than producing an invented deadline.

## 7. State ownership and cache behavior

- The session boundary owns `checking`, `authenticated`, `signedOut`, and unrecovered bootstrap/identity failure behavior plus the current user.
- TanStack Query owns server resources and request deduplication; auth forms own transient interaction state.
- Auth fields, touched flags, visibility, pending state, and form errors remain local to their form.
- Intended destinations and one-time auth notices use router state and are not persisted.
- Clearing private data removes authenticated query data rather than merely hiding it. Query-key conventions must make this deterministic as later features are added.
- Login and Registration mutations do not retry automatically.
- Session retrieval does not poll or refetch on window focus. Explicit Retry is the recovery mechanism for visible connection failures.

## 8. Fields, validation, and form behavior

### Validation timing

- Show no validation errors on initial render.
- Validate a field after blur, then update that field's error as the user edits it.
- Validate every field on submission.
- After a rejected client-side submission, focus the first invalid field.
- After a non-field server failure, focus the form-level error summary.
- Backend validation remains authoritative. Map applicable `details[].field` entries beside controls; unrecognized or non-field details fall back to the form-level error.

### Login fields

| Field | Client rules | Autocomplete |
| --- | --- | --- |
| Email | Required, trimmed, valid email, at most 254 characters; lowercase before submission | `username` |
| Password | Required, 1–72 JavaScript string characters; never trim | `current-password` |

### Registration fields

Display order is first name, last name, username, email, password.

| Field | Client rules | Autocomplete |
| --- | --- | --- |
| First name | Required, trimmed, 1–50 characters | `given-name` |
| Last name | Required, trimmed, 1–50 characters | `family-name` |
| Username | Required, trimmed, 3–50 characters | `username` |
| Email | Required, trimmed, valid email, at most 254 characters; lowercase before submission | `email` |
| Password | Required, 8–72 JavaScript string characters; never trim | `new-password` |

Show quiet persistent hints only for `Username: 3–50 characters.` and `Password: 8–72 characters.` Do not invent composition rules.

### Pending behavior

While an auth form is submitting:

- disable its fields, password-visibility control, submit button, and auth-form switch link;
- change the button label to `Logging in…` or `Creating account…`;
- keep the layout stable and announce the state accessibly;
- accept no duplicate submission.

Restore controls after failure and preserve all values, including the password. Clear them after success or navigation. Auth forms do not need Cancel buttons.

### Rate limiting

- Present the backend message in the form-level alert.
- When a valid retry deadline is available, state when another attempt is allowed and prevent resubmission until that deadline.
- Keep fields editable and preserve values.
- Do not run a second-by-second countdown. Recalculate when the document regains visibility or the user attempts submission.
- Without valid retry metadata, say `Please wait before trying again.` without inventing a duration or encouraging immediate retries.

## 9. Copy and feedback

Login contains the fields and actions defined above plus `Need an account? Register.` Registration contains its fields and `Already have an account? Log in.` A simple Bandos identifier may link to `/`.

Do not include Remember me, Forgot password, social authentication, a terms checkbox without a real policy requirement, or disabled future controls.

Use these decisions consistently:

- Invalid credentials: retain the backend-safe `Invalid email or password` meaning without revealing account status.
- Account conflict: `That username or email is already in use.` Do not identify which field conflicts.
- Session expiration: `Your session expired. Log in to continue.`
- Logout success: `You’ve been logged out.`
- Logout failure: `We couldn’t log you out. Try again.`
- Bootstrap/identity connection failure: a full-page `We couldn’t connect to Bandos` state with Retry.

Auth failures remain within their form. Successful Login and Registration need no toast. Session and Logout notices travel through router state and are consumed after presentation so refresh does not replay stale feedback.

## 10. Responsive and accessibility requirements

- Forms remain usable at narrow mobile widths without horizontal scrolling or clipped controls.
- Use a semantic form, visible labels, associated hints/errors, and an actual submit button.
- Form-level errors use an appropriate alert treatment; pending/loading states use a non-disruptive status announcement.
- Error focus is programmatically moved only after submission or a server failure, not on every keystroke.
- Show/Hide password is a keyboard-operable button with an accessible name that reflects the available action and does not submit the form.
- Disabled/pending behavior must remain perceivable and must not rely on color alone.
- Preserve the Phase 0 skip link, landmarks, visible focus, and narrow-width safety.
- Browser Back, Forward, refresh, direct entry, and password-manager/autofill behavior must be manually checked.
- Final typography, spacing, color, and responsive composition remain Phase 6 work.

## 11. Acceptance criteria

1. Initial load shows neither signed-out nor protected content before `/users/me` resolves.
2. A valid cookie session restores the normalized current user; `AUTHENTICATION_REQUIRED` produces signed-out state; other bootstrap failures show Retry without pretending the user is signed out.
3. Protected routes redirect signed-out users to Login and restore only validated internal destinations after Login or Registration.
4. Authenticated users cannot remain on Login or Registration, and auth-related replacement navigation does not create stale history entries.
5. Login and Registration submit exact contract shapes, fetch `/users/me` after success, and never infer identity from the auth success message.
6. If post-auth identity retrieval fails transiently, Retry fetches only `/users/me`; Registration or Login is not repeated.
7. Both forms implement the agreed validation timing, field rules, autocomplete metadata, password visibility, error mapping, focus, and pending behavior.
8. Invalid credentials and account conflicts do not reveal sensitive account information.
9. Rate-limit feedback uses valid server timing when available, preserves editable values, and does not invent a retry duration.
10. `AUTHENTICATION_REQUIRED` during authenticated use clears private data and restores the current safe destination after reauthentication without preserving unsaved form data.
11. Successful Logout clears private state and reaches Login without a return destination; failed Logout keeps the session state and offers retry.
12. Auth messages remain contextual and transient without introducing a general notification framework.
13. Auth flows are keyboard-operable, semantically labeled, announced appropriately, and usable at a narrow mobile viewport.
14. Focused tests, lint, and the production build pass.

## 12. Verification

### Automated

Introduce React Testing Library, `user-event`, and jsdom. Keep pure validation and destination tests in Vitest's non-browser environment when possible; use jsdom only for component behavior.

Focused coverage includes:

- bootstrap checking, authenticated, signed-out, transient failure, and Retry states;
- protected and signed-out-only route behavior;
- accepted and rejected restoration destinations, including path/query/hash preservation;
- Login and Registration validation timing, exact submissions, pending state, backend field errors, form errors, rate limiting, and focus placement;
- successful auth followed by `/users/me` and restored navigation;
- transient and authentication failures during post-auth identity retrieval;
- session-expiration transition and private-query removal;
- successful and failed Logout;
- representative keyboard and accessible-name/error associations.

Avoid large snapshots, exhaustive markup assertions, and tests of React Router or TanStack Query behavior that Bandos does not own.

### Manual

- Load with a valid session, no session, an unavailable backend, and a recoverable backend.
- Directly enter each protected route while signed out and verify restoration after Login and Registration.
- Try malformed/external restoration values and confirm fallback to `/`.
- Exercise Login and Registration with keyboard only, browser autofill/password management, server field errors, invalid credentials/conflict, and rate limiting.
- Confirm history behavior around guards, successful auth, switching forms, expiration, and Logout.
- Confirm a post-registration `/users/me` failure never repeats account creation.
- Confirm session expiration clears private data and does not retain unsaved values.
- Check both forms and full-page session states at narrow mobile and desktop widths.
- Run lint, Vitest, and the production build.

## 13. Decisions and deferred work

Confirmed during discovery:

- router-state destination restoration shared by Login and Registration;
- unknown session failures are distinct from signed-out state;
- expired sessions clear private data and preserve only a safe destination;
- failed Logout cannot be represented as success;
- blur-then-edit and submit-time validation with deliberate error focus;
- no confirm-password field and accessible password visibility controls;
- server-derived rate-limit timing without a live countdown;
- no repeated auth mutation when `/users/me` fails after auth success;
- minimal auth content with no unsupported controls;
- replacement history semantics around guards and auth transitions;
- one bootstrap check, no polling, focus refetching, or cross-tab synchronization;
- neutral full-page bootstrap presentation;
- no Cancel action on auth forms;
- contextual router-state messages instead of a notification framework;
- React Testing Library coverage now and Playwright deferred.

Deferred:

- final authored auth-screen visual design and breakpoints (Phase 6);
- populated authenticated navigation (Phase 2);
- authored not-found recovery (Phase 5);
- full critical-journey Playwright coverage once enough of the release loop exists;
- cross-tab session synchronization unless real usage demonstrates a need.
