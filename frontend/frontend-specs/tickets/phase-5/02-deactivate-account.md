# Deactivate the account

## Objective

A musician can make an informed, password-confirmed deactivation decision and leave the app in a clean signed-out state.

## Source Specification

[Phase 5 — Account and resilience](../../06-phase-5-account-and-resilience.md), sections 4 and 7–8.

## Context

The Account page comes from ticket 01. `DELETE /users/me` soft-deactivates the user and destroys the session, but the endpoint has no body validation and an uncertain network result must not be treated as a known outcome.

## Scope

- Add Deactivate account to Account, opening an accessible modal confirmation with the account's access and data effects.
- Collect the current password in the dialog; provide Cancel and Deactivate account actions.
- Validate a non-empty string and send only the untrimmed password field. Prevent duplicate submission and navigation while the request is pending.
- Keep the dialog usable after incorrect credentials and show handled errors near the affected control or action.
- Check `GET /users/me` after an ambiguous failure before allowing a deliberate retry or completing a signed-out transition.
- On confirmed success, clear session identity and private caches, then replace-navigate to Login with a deactivation notice.

## Out of Scope

- Profile editing belongs to ticket 01; unknown-route recovery to ticket 03; broad usability audit to ticket 04.
- Account reactivation, deletion of bands or events, typed-name confirmation, backend changes, and automatic retry.

## Acceptance Criteria

- [ ] Given the Account page, Deactivate account opens a dialog that names the account and explains access ends, active member visibility ends, and existing band/event records remain.
- [ ] Given Cancel or Escape while no request is pending, the dialog closes without a request and returns focus to its trigger.
- [ ] Given an empty password, confirmation is blocked with an associated error; a valid value sends exactly one untrimmed password field.
- [ ] Given `INVALID_CREDENTIALS`, the dialog remains open with the password available for correction and its error focused.
- [ ] Given a pending request, duplicate confirmation and premature navigation are prevented.
- [ ] Given an ambiguous result, the app checks the current session once and never automatically replays deletion or claims a result it cannot establish; if the check fails, it offers Check again before another deletion attempt.
- [ ] Given confirmed deactivation, private data is cleared and Login replaces Account with a brief notice; browser back does not reveal protected content.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Cover Cancel/Escape and focus, empty and incorrect password, exact request body, pending duplication guard, confirmed success and cache clearing, and ambiguous-result reconciliation.

### Manual / Smoke Verification

- Check keyboard dialog flow and narrow-width presentation.

### Explicitly Not Required

- Full browser lifecycle simulation of server-side cookie destruction or account reactivation.

## Implementation Notes

Use the existing modal and session patterns. `DELETE /users/me` returns a message on success; `INVALID_CREDENTIALS` is distinct from `AUTHENTICATION_REQUIRED`. The password must not be trimmed, stored in durable client state, or logged.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Required tests pass, along with relevant existing tests, lint, production build, and `git diff --check`.
- [ ] No known regression exists within touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Ticket 04 includes deactivation in the final critical journey.
