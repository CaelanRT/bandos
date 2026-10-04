# Validate Login on submission and silence expiration notices

> **Status:** In Progress — implementation, verification and independent review passed; Draft PR pending
> **Dependencies:** [Phase 7 shell review](../phase-7/04-review-navigation-and-layout.md) passed.

## Objective

Reduce distracting Login feedback while retaining authentication validation and recovery.

## Source Specification

[Phase 8 — Forms and membership refinement](../../09-phase-8-forms-and-membership-refinement.md), sections 1–2 and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

Login currently validates touched fields on change/blur and `LoginNotice` displays an expired-session notice. Only Login validation timing and expired-session presentation are overridden.

## Scope

- Remove expired-session notice/separator presentation while keeping session cleanup and destination restoration.
- Validate all Login fields only on Submit/Enter; clear edited field errors without live revalidation and clear stale invalid-credentials feedback when credentials change.
- Use the agreed password/credential copy while retaining rate-limit, pending, server field-error, and authentication-completion behavior.

## Out of Scope

- Registration validation timing, shared password-toggle presentation, and membership changes.
- Session policy, authentication rules, new account capabilities, and backend changes.

## Acceptance Criteria

- [x] Expiration clears private state and redirects to Login without an expiration notice or separator while preserving the recognized post-authentication destination; logout and deactivation notices remain available.
- [x] Initial render, typing, and blur show no Login field validation; Submit or Enter validates all fields, prevents invalid requests, and focuses the first invalid field.
- [x] After failed submission, editing clears only that field’s displayed error and invalid state without revalidation; other errors remain until edited or the next submission, which validates all fields again.
- [x] Empty password reports `Please enter your password`; `INVALID_CREDENTIALS` reports `Invalid email or password`, and editing credentials clears that stale message.
- [x] Editing does not clear active rate-limit or authentication-completion recovery information or bypass their guards; meaningful server-error feedback remains available.
- [x] Existing email/password rules, normalization, server field-error mapping, pending/duplicate protection, accessible error focus/announcement, and safe destination restoration remain intact.

## Testing Strategy

### Unit Tests

- Update the existing empty-password validation-copy expectation without changing validation rules.

### Integration Tests

- Update Login tests expecting blur/live validation or expiration notices. Cover Submit/Enter, error clearing, resubmission, invalid-request prevention, safe credential copy, and rate-limit preservation.
- Retain session/private-cache cleanup, destination restoration, unrelated notices, server errors, and authentication-completion recovery coverage in the relevant Login/session suites.

### Manual / Smoke Verification

- Review Login default/error/pending states with keyboard at desktop, 320px, and zoom.

### Explicitly Not Required

- Changes to Registration validation timing or duplicate authentication/session lifecycle coverage.

## Implementation Notes

Relevant files are `LoginForm.jsx`, `LoginNotice.jsx`, `loginValidation.js`, and the session route/boundary behavior. [Phase 1](../../02-phase-1-authentication.md) remains authoritative except for the explicit Login timing/copy and expired-session presentation overrides. Keep existing Login API contracts and field rules.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 04 reviews Phase 8 before Phase 9.

## Implementation Verification

- Login validates on Submit/Enter only, clears only the edited field's errors, and clears stale invalid-credentials feedback without clearing rate-limit/server/completion recovery information.
- Expiration presentation is removed; the existing session/destination lifecycle remains intact.
- Focused authentication/session/registration verification: 92 tests passed across 8 files.
- Full regression suite: 399 tests passed across 33 files. An initial run hit an intermittent deactivation Back-navigation assertion; the unchanged suite passed in isolation and the full rerun passed.
- `npm run lint` passed with the existing `EditEvent.jsx:41` warning. `npm run build` and `git diff --check` passed; no separate typecheck exists.
- Chromium with controlled API fixtures: default, field-error, pending and invalid-credentials states passed at 1440px, 320px and native 200% zoom (1280px window / 640 CSS pixels). Keyboard Enter, first-error/alert focus, field clearing, disabled controls and absence of horizontal overflow checked; screenshots inspected. Live backend, real devices and other browser engines were not tested.
- Independent `review-ticket` review: PASS; all six acceptance criteria passed, no blocking or non-blocking findings. Reviewer independently reran 35 Login/session tests.
