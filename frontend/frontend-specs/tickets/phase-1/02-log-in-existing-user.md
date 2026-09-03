# Allow an existing user to log in and resume their work

## User/system outcome

A signed-out existing user can authenticate, receive actionable and privacy-safe feedback, and continue to the protected Bandos location they originally requested.

## Context

This Phase 1 vertical slice fills the Login route created by the session/access ticket. Authentication success returns presentation text only, so the flow is incomplete until `/users/me` supplies verified identity.

## In scope

- Login email and password fields.
- Accessible Show/Hide password behavior.
- Blur-then-edit and submit-time client validation.
- Backend field-detail mapping and form-level failures.
- Invalid-credentials, rate-limit, unexpected-error, and pending states.
- Exact Login request shape and no automatic mutation retry.
- Follow-up `/users/me` retrieval and normalized session update.
- Safe destination restoration with replacement navigation.
- Preservation of the intended destination when linking to Registration.
- Full-page identity-retrieval failure with Retry that calls only `/users/me`.
- Contextual completion failure if the follow-up returns `AUTHENTICATION_REQUIRED`.
- Focused component and routing tests.

## Out of scope

- Registration implementation.
- Forgot password, Remember me, social login, or account-status disclosure.
- General notification infrastructure.
- Final authored styling and Playwright.

## Routes and access

- `/login` is signed-out-only.
- Authenticated entry replacement-redirects to `/`.
- Successful Login replacement-navigates to the validated intended destination or `/`.
- The Registration link uses normal navigation and carries the intended destination.

## API contract

Submit `POST /auth/login` with only normalized `email` and untrimmed `password`. On `200`, ignore the message as identity and call `GET /users/me`.

Handle:

- `400 VALIDATION_ERROR`, mapping recognized details to fields;
- `401 INVALID_CREDENTIALS` as a privacy-safe form error;
- `429 TOO_MANY_ATTEMPTS`, using valid normalized `Retry-After` metadata when present;
- `500 INTERNAL_ERROR`, network failures, and malformed responses as stable form failures;
- `401 AUTHENTICATION_REQUIRED` from the follow-up identity request as an incomplete sign-in.

## Experience and states

- Initial: visible labels, email and password inputs, Show/Hide, `Log in`, and `Need an account? Register.`
- Validation: no initial errors; validate on blur and update thereafter; validate all on submit.
- Client rejection: focus the first invalid field.
- Pending: disable all form controls and the Registration link, label the button `Logging in…`, announce status, and preserve layout.
- Field failure: associate errors with their controls.
- Form failure: focus the form alert and preserve both values.
- Invalid credentials do not reveal whether an account is absent or inactive.
- Rate limited: preserve editable values and prevent submission until a known deadline; without one, provide neutral wait guidance.
- Post-auth identity failure: leave the form flow for the full-page connection state; Retry never repeats Login.
- Success: no toast; destination arrival is confirmation.

Use `autocomplete="username"` for email and `autocomplete="current-password"` for password. Email is trimmed, validated, limited to 254 characters, and lowercased for submission. Password is required, limited to 72 JavaScript string characters, and never trimmed.

## Acceptance criteria

- The form is semantic, labeled, keyboard-operable, and usable at narrow width.
- Client validation and normalization match the backend contract without inventing credential rules.
- Duplicate requests cannot occur while pending.
- The API receives only email and password in the exact expected shape.
- Backend field details and stable codes appear at the correct scope with deliberate focus.
- Password visibility changes input presentation without changing its value or submitting.
- A successful Login does not establish identity until `/users/me` succeeds.
- Transient follow-up failure can recover by retrying only `/users/me`.
- A safe intended destination survives Login/Registration navigation and is restored with replacement history semantics.
- Unsafe or absent restoration state resolves to `/`.
- Focused tests, lint, and build pass.

## Verification

- Component tests cover initial semantics, blur/edit/submit validation, focus, visibility, pending state, exact request shape, field/form errors, invalid credentials, and rate limiting.
- Integration-style component tests cover Login → `/users/me` → restored route.
- Tests prove Login is not repeated after post-auth identity failure and Retry can recover.
- Manually check browser autofill/password-manager behavior, keyboard-only use, Back/Forward, refresh recovery, and narrow mobile layout.
- Run lint, Vitest, and the production build.

## Dependencies

- Restore authenticated sessions and enforce route access.
- Implemented Login and current-user backend endpoints.

## Decisions and follow-ups

Authentication feedback remains local or route-contextual. A general notification system and Playwright journey remain deferred.
