# View and edit the account profile

> **Status:** For Review
> **Draft PR:** [#40](https://github.com/CaelanRT/bandos/pull/40)

## Objective

An authenticated musician can reach Account, inspect current profile information, and save supported name and username changes without stale identity elsewhere in the app.

## Source Specification

[Phase 5 — Account and resilience](../../06-phase-5-account-and-resilience.md), sections 2–3 and 7–8.

## Context

`/account` currently redirects home and global navigation has no Account destination. The session already holds a normalized current user, while `PATCH /users/me` lacks validation middleware.

## Scope

- Replace the `/account` placeholder with a protected page and add Account to the existing desktop and mobile navigation.
- Show first name, last name, username, email, and plan; edit the first three in one form. Email and plan are read-only.
- Provide Save and Cancel, dirty-navigation recovery, pending state, field errors, and form feedback.
- Validate trimmed first and last names at 1–50 characters and username at 3–50. Submit only changed supported fields.
- Normalize the response, update shared session identity, and reconcile affected member data after a confirmed save.
- Handle account conflict, backend validation, authentication expiration, rate limits, and ambiguous save results without automatically replaying the mutation.

## Out of Scope

- Deactivation belongs to ticket 02.
- Unknown-route and global recovery work belongs to ticket 03; final critical-flow audit belongs to ticket 04.
- Email, plan, password, or account-creation-date editing; final authored styling; backend validation changes.

## Acceptance Criteria

- [ ] Given an authenticated user, `/account` and the Account navigation link open a page with their current supported profile fields; email and plan have no edit controls.
- [ ] Given a changed valid profile field, Save sends only changed supported fields with trimmed values; an unchanged form sends no `PATCH`.
- [ ] Given a confirmed save, the account page and other current-user displays reflect the normalized returned identity, and affected member data is refreshed or reconciled.
- [ ] Given an invalid field, the form blocks submission, associates feedback with the control, and focuses a correctable field; Cancel restores the latest confirmed values.
- [ ] Given a dirty draft, navigation uses the existing Keep editing / Discard changes flow.
- [ ] Given conflict, validation, rate-limit, or ambiguous failure, the draft remains available with safe feedback; an ambiguous save checks the current user before another deliberate attempt and offers Check again if that read fails.
- [ ] Given `AUTHENTICATION_REQUIRED`, the existing signed-out transition clears private data.

## Testing Strategy

### Unit Tests

- Cover trimmed field limits and changed-field payload selection, including the no-change case.

### Integration Tests

- Cover protected navigation, a successful save reflected in shared identity, Cancel/dirty navigation, field and conflict feedback, and one ambiguous-save reconciliation path.

### Manual / Smoke Verification

- Check account navigation and form use at mobile width with keyboard focus.

### Explicitly Not Required

- Duplicate coverage of all global session branches or unsupported account changes.

## Implementation Notes

Use the existing normalized current-user shape, authenticated request client, session boundary, shared validators, and unsaved-navigation behavior. `PATCH /users/me` accepts `username`, `firstName`, and `lastName`; its response uses raw snake_case user fields and must pass through the current-user normalizer.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Required tests pass, along with relevant existing tests, lint, production build, and `git diff --check`.
- [ ] No known regression exists within touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Ticket 02 adds account deactivation. Ticket 04 performs the final critical-flow usability pass.
