# Review the Phase 7 navigation and layout

> **Status:** Verification complete — independent review passed; awaiting Draft PR
> **Dependencies:** Phase 7 implementation tickets [01](01-simplify-navigation-and-account-access.md), [02](02-navigate-with-mobile-drawer.md), [03](03-restore-document-scrolling.md) complete.

## Objective

Record the required browser review of the complete shared shell before Phase 8 starts.

## Source Specification

[Phase 7 — Navigation and layout refinement](../../08-phase-7-navigation-and-layout-refinement.md), sections 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

The implementation tickets own their focused tests and manual checks. This ticket owns the combined review evidence and handoff, following the repository’s earlier phase-verification pattern.

## Scope

- Review every authenticated shell, including creation/editing, Account, and recovery screens with available navigation.
- Check desktop sidebar/account menu, mobile drawer, active states, long content/document scrolling, keyboard/touch, and responsive accessibility against Phase 7.

## Out of Scope

- New product requirements, unrelated redesign/refactoring, and backend implementation.
- Duplicating implementation-ticket tests or reopening decisions settled in the approved specifications.

## Acceptance Criteria

- [x] The Phase 7 acceptance criteria are accounted for with recorded browser evidence for desktop, 320px, 200% zoom, long band names/lists, Account scrolling, keyboard use, and reduced motion.
- [x] Drawer dismissal/focus, account navigation/logout failure, Create Band active state, parent-band selection, and existing session/creation-origin/unsaved safeguards have passing focused coverage.
- [x] The shared shell browser review passes before Phase 8 begins; any demonstrated in-scope defect is resolved and relevant checks are rerun.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Run the relevant existing and updated suites from the implementation tickets. Add tests only for a demonstrated in-scope regression found during this review.

### Manual / Smoke Verification

- Review desktop/mobile navigation, all specified drawer/menu dismissal methods, logout failure, long lists/names, Account scroll, creation/editing/recovery shells, keyboard, zoom, and reduced motion.

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

Phase 8 begins only after this review passes.

## Implementation Verification

- [Combined browser review and handoff](04-verification-result.md): PASS, with 51 route/state/journey results covering all authenticated surfaces, desktop, 320px and native Chromium 200% zoom. No in-scope application defect found.
- Existing full regression suite: 396 tests across 33 files passed. No duplicate tests or application changes were needed.
- `npm run lint`, `npm run build`, and `git diff --check` passed; lint retains the existing `EditEvent.jsx:41` warning.
- Controlled API fixtures were used; live backend, real devices and other browsers were not tested.
- Independent `review-ticket` review: PASS, no blocking findings. A non-blocking screenshot clarification was addressed with six explicit viewport-bound checks and a settled native-zoom capture.
