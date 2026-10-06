# Review the Phase 8 forms and membership increment

> **Status:** For Review — [Draft PR #58](https://github.com/CaelanRT/bandos/pull/58); combined and independent reviews passed 2026-10-06
> **Dependencies:** Phase 8 implementation tickets [01](01-refine-login-feedback.md), [02](02-compact-password-controls.md), [03](03-keep-member-addition-visible.md) complete.

## Objective

Record the required Login, Registration, and Members review before Phase 9 starts.

## Source Specification

[Phase 8 — Forms and membership refinement](../../09-phase-8-forms-and-membership-refinement.md), sections 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

The implementation tickets own their focused tests and manual checks. This ticket owns the combined review evidence and handoff, following the repository’s earlier phase-verification pattern.

## Scope

- Review the three changed surfaces in their specified states under the reviewed Phase 7 shell.
- Verify the Login timing/copy/expiration changes, shared password control/registration hints, and always-visible authorized member form against Phase 8.

## Out of Scope

- New product requirements, unrelated redesign/refactoring, and backend implementation.
- Duplicating implementation-ticket tests or reopening decisions settled in the approved specifications.

## Acceptance Criteria

- [x] Login, Registration, and Members are browser-reviewed in default, error, pending, and applicable success states at desktop, 320px, and zoom with keyboard.
- [x] Phase 8 criteria are accounted for, including rate-limit/completion recovery, field-error clearing/resubmit, toggle/hint accessibility, member permissions/reconciliation, and nonempty draft safeguards.
- [x] The Phase 8 increment review passes before Phase 9 begins; demonstrated in-scope defects are resolved and relevant checks are rerun.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Run the relevant existing and updated suites from the implementation tickets. Add tests only for a demonstrated in-scope regression found during this review.

### Manual / Smoke Verification

- Review Login Submit/Enter and correction, silent expiration/unrelated notices, both password toggles, Registration hints, and leader/member addition including pending, success, error, and recovery.

### Explicitly Not Required

- A new browser automation framework, exhaustive visual snapshots, coverage targets, or duplicate mutation lifecycle suites.

## Implementation Notes

Record concise verification evidence in this phase’s ticket directory, naming checked surfaces/states, actual commands/results, and any unresolved findings. A review cannot pass with unresolved failures against the approved criteria. Use the current phase specs as authority; raw [user feedback](../../feedback/phase6-usertestingfeedback.md) does not override their settled decisions. Verification does not add acceptance requirements to sibling tickets.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Phase 9 begins only after this review passes.

## Implementation Verification

- [Combined browser review and handoff](04-verification-result.md): PASS, with 93 passing state/configuration results across Login, Registration, and leader/member Members at desktop, 320px, and native Chromium 200% zoom.
- Focused regression: 161 tests across 10 files passed; full regression: 399 tests across 33 files passed.
- `npm run lint`, `npm run build`, and `git diff --check` passed; lint retains the existing `EditEvent.jsx:41` warning.
- No demonstrated in-scope defect; no application changes or duplicate tests needed. Controlled API fixtures were used; live backend, real devices and other engines were not tested.
- Independent `review-ticket` review: **PASS**, all three acceptance criteria passed, no blocking or non-blocking findings.
