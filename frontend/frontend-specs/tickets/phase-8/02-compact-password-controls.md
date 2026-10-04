# Use compact password controls and simplify registration hints

> **Status:** Completed — [merged PR #56](https://github.com/CaelanRT/bandos/pull/56); merged and completion confirmed 2026-10-04
> **Dependencies:** [Phase 7 shell review](../phase-7/04-review-navigation-and-layout.md) passed; can proceed independently of Phase 8 tickets 01 and 03.

## Objective

Give Login and Registration a shared compact password toggle and remove persistent registration length hints.

## Source Specification

[Phase 8 — Forms and membership refinement](../../09-phase-8-forms-and-membership-refinement.md), sections 1, 3, and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

Both forms already use `PasswordVisibility`, currently rendered as a secondary text button. Registration has a persistent password hint but no persistent email character-limit hint.

## Scope

- Use a shared compact eye/eye-off password-visibility control adjacent to the input on Login and Registration.
- Remove persistent Registration password/email character-limit text and dangling accessible descriptions while retaining actual validation limits and the username hint.

## Out of Scope

- Login validation timing/expiration behavior, owned by ticket 01.
- Registration validation timing, field/limit changes, new hints, or other password-bearing forms.

## Acceptance Criteria

- [x] Login and Registration share a visually smaller adjacent password-visibility control, preferably eye/eye-off, with an accessible `Show password`/`Hide password` name and explicit input relationship.
- [x] The control has a usable touch target and visible focus; toggling preserves the password value, never submits, and remains disabled during submission.
- [x] Registration has no persistent password/email character-limit hints and no dangling accessible hint references; no email-limit hint is introduced.
- [x] Registration retains actual limits/correction errors, username guidance, remaining fields, autocomplete, existing validation timing, and error handling.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Update existing password-toggle expectations on both forms; verify value preservation, non-submission, input association, and pending disablement.
- Update relevant registration hint/accessibility expectations while preserving validation-limit coverage.

### Manual / Smoke Verification

- Review both forms at desktop, 320px, and zoom with keyboard; inspect compact controls in default/error/pending states.

### Explicitly Not Required

- Duplicate registration validation tests, new email hint coverage, or redesign of Account deactivation password controls.

## Implementation Notes

Reuse `PasswordVisibility.jsx` and existing form input IDs. [Phase 1](../../02-phase-1-authentication.md) remains the behavioral baseline except for the deleted persistent password-length hint. Match the established warm-paper/oxblood language.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 04 reviews Phase 8 before Phase 9.

## Verification Results

- Focused auth verification: 6 suites, 74 tests passed. Full `npm test`: 33 suites, 399 tests passed.
- `npm run lint`, `npm run build`, and `git diff --check` passed. Lint retains the existing `EditEvent.jsx` effect warning.
- Chromium checks passed on Login and Registration at desktop (1440px), 320px, and native 200% zoom. Verified keyboard toggling, unchanged values without submission, input association, 44px touch targets, visible focus, disabled pending controls, and default/error/pending layouts without horizontal overflow.
- Registration keeps the username hint and validation errors, with no persistent password/email limit hint or dangling hint description.
- Independent `review-ticket` review: **PASS**, with no blocking or non-blocking findings and no outstanding manual verification.
