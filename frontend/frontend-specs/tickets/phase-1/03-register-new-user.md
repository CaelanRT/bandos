# Allow a new user to register and enter Bandos

> **Status:** Completed

## User/system outcome

A new user can create an account with clear validation, avoid unsupported onboarding promises, and enter the authenticated application or their original protected destination.

## Context

This Phase 1 vertical slice fills the Registration route using the established session, destination, and Login form conventions. The backend creates the session during registration but returns no structured identity, so `/users/me` must complete the flow.

## In scope

- First name, last name, username, email, and password fields in the agreed order.
- Username/password hints and accessible Show/Hide password behavior.
- Auth-form validation timing, errors, focus, pending behavior, and value preservation.
- Exact Registration request shape and no automatic mutation retry.
- Backend field-detail mapping, account-conflict, rate-limit, and unexpected failures.
- Follow-up `/users/me`, normalized session update, and destination restoration.
- Preservation of the destination when linking to Login.
- Post-registration identity failure recovery without repeating account creation.
- Focused component and routing tests.

## Out of scope

- Confirm password, email verification, terms acceptance, onboarding, band creation, or invitation behavior.
- Password-strength rules not enforced by the backend.
- General notification infrastructure, final authored styling, or Playwright.

## Routes and access

- `/register` is signed-out-only.
- Authenticated entry replacement-redirects to `/`.
- Successful Registration replacement-navigates to the validated intended destination or `/`.
- The Login link uses normal navigation and carries the intended destination.

## API contract

Submit `POST /auth/register` with only `username`, `firstName`, `lastName`, `email`, and `password`. Trim the four non-password fields, lowercase email, and never trim password. On `201`, ignore the message as identity and call `GET /users/me`.

Handle:

- `400 VALIDATION_ERROR`, mapping recognized details to fields;
- `409 ACCOUNT_CONFLICT` as the general form error `That username or email is already in use.`;
- `429 TOO_MANY_ATTEMPTS`, using valid normalized `Retry-After` metadata when present;
- unexpected, network, and malformed-response failures as stable form errors;
- `401 AUTHENTICATION_REQUIRED` from follow-up identity retrieval as incomplete registration sign-in.

## Experience and states

- Initial: five visible labeled fields, quiet `3–50 characters` username and `8–72 characters` password hints, Show/Hide, `Create account`, and `Already have an account? Log in.`
- Do not show errors on initial render or require password composition beyond length.
- Validate blurred fields and update them during subsequent edits; validate all on submit.
- Focus the first invalid field for client rejection and the form alert for non-field server failure.
- Pending: disable the form and Login link, label the button `Creating account…`, announce status, and prevent duplicates.
- Preserve all values after failure. Do not disclose whether username or email caused a conflict.
- Rate limiting follows the shared no-countdown behavior and preserves editable values.
- Post-registration identity failure shows the full-page connection state; Retry calls only `/users/me` so account creation is never repeated.
- Success needs no toast.

Autocomplete values are `given-name`, `family-name`, `username`, `email`, and `new-password` respectively.

## Acceptance criteria

- Field order, labels, hints, autocomplete, validation, normalization, and limits match the Phase 1 specification and backend behavior.
- No confirmation field or unsupported authentication/onboarding control appears.
- The exact recognized body is submitted once and no mutation retry occurs.
- Field details, conflict, rate-limit, and unexpected failures use the correct scope and focus behavior.
- Conflict copy remains intentionally ambiguous between username and email.
- Password visibility is accessible and value-preserving.
- Successful Registration establishes identity only through `/users/me`.
- Follow-up failure never causes automatic or user Retry to repeat Registration.
- Safe restoration works across the Registration/Login link and after success; unsafe state falls back to `/`.
- The form works with keyboard-only operation and at narrow mobile widths.
- Focused tests, lint, and build pass.

## Verification

- Component tests cover every field's representative valid/invalid cases, validation timing, focus, hints, autocomplete, visibility, pending state, and exact submission normalization.
- Tests cover backend field errors, ambiguous conflict copy, rate-limit timing with valid/invalid metadata, and unexpected failures.
- Integration-style component tests cover Registration → `/users/me` → restored route and prove recovery does not repeat Registration.
- Manually check autofill/password managers, keyboard-only operation, Back/Forward, narrow layout, and refresh during post-auth recovery.
- Run lint, Vitest, and the production build.

## Dependencies

- Restore authenticated sessions and enforce route access.
- Reuse the form/error conventions proven by Allow an existing user to log in.
- Implemented Registration and current-user backend endpoints.

## Decisions and follow-ups

The new account may not have access to a restored band/event destination. Restore it anyway; the relevant later feature owns inaccessible-resource recovery.
