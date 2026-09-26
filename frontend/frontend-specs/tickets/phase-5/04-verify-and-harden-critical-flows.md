# Verify and harden critical flows

## Objective

The completed functional frontend remains coherent and operable across its critical journey when viewed with a keyboard, narrow viewport, and browser zoom.

## Source Specification

[Phase 5 — Account and resilience](../../06-phase-5-account-and-resilience.md), sections 5–8.

## Context

Account and global recovery work are complete in tickets 01–03. The master plan requires a final state-consistency, responsive, and accessibility pass before Phase 6's visual implementation.

## Scope

- Walk login or registration, personal datebook, band navigation and members, event detail and management, Account, deactivation, and logout.
- Check session expiry, stale permission and deleted-resource transitions, plus confirmed mutation effects across related routes.
- Check keyboard order, visible focus, labels and error associations, modal focus, mobile menu, 320px viewport, and 200% browser zoom.
- Fix functional barriers and contradictory state found in these checks within the affected flow; add focused regression tests for each code fix that needs them.
- Record the checked flows, browser/viewport coverage, fixed findings, and deferred findings.

## Out of Scope

- Authored visual styling, typography, color, decorative composition, and general design polish belong to Phase 6.
- New product capabilities, broad refactoring, and speculative edge-case frameworks.
- Reimplementing behavior already covered by tickets 01–03 unless a concrete regression is found.

## Acceptance Criteria

- [ ] The recorded critical journey covers every listed route family and session/resource/permission transition, with any functional state inconsistency found corrected.
- [ ] Confirmed profile, band, and event mutations are reflected in related visible surfaces without contradictory stale state.
- [ ] The checked critical actions are keyboard operable with usable focus, labels, errors, and dialog behavior; any functional barrier found is corrected.
- [ ] The journey remains usable at 320px and 200% zoom without loss of required controls; any functional barrier found is corrected.
- [ ] Verification records fixed and deferred findings, and relevant automated checks pass.

## Testing Strategy

### Unit Tests

- Only for pure logic changed to fix a concrete finding.

### Integration Tests

- Add narrow regression coverage for concrete state or interaction fixes; rely on existing suites where they already prove the behavior.

### Manual / Smoke Verification

- Run and record the complete critical journey using keyboard, 320px viewport, and 200% zoom, including direct URLs and relevant stale-state scenarios.

### Explicitly Not Required

- Exhaustive browser permutations, duplicate tests for all existing flows, or Phase 6 visual QA.

## Implementation Notes

Use the current session provider, band/event query keys, route recovery, and form patterns. Keep fixes local to observed functional gaps and avoid adding a general state library.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Relevant Vitest tests, lint, production build, and `git diff --check` pass.
- [ ] The verification record identifies coverage and remaining follow-up work; no known functional blocker remains in the checked journey.

## Follow-up Work

Phase 6 owns visual implementation and final visual QA.
