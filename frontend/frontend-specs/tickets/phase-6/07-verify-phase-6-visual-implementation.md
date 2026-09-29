# Verify the Phase 6 visual implementation

> **Status:** In Progress
> **Audit:** [Verification record](07-verification-result.md)
> **Manual sign-off:** [Phase 6 verification guide](../../phase-6-manual-verification.md)

## Objective

Confirm that every current route and its meaningful states form one usable visual system, and close concrete visual or accessibility defects found in the final pass.

## Source Specification

[Phase 6 — Visual implementation](../../07-phase-6-visual-implementation.md), sections 3–8.

## Context

Tickets 01–06 deliver the visual system by route group. A cross-route review is needed to catch inconsistencies and responsive or accessibility gaps that isolated route checks may miss.

## Scope

- Audit current routes and representative populated, loading, empty, validation, error, permission, success, dialog, and recovery states where applicable.
- Check desktop, 320px, 200% zoom, keyboard focus/order, contrast, target reachability, and reduced-motion behavior.
- Fix concrete inconsistencies or barriers within the Phase 6 presentation scope, and record the findings and results.
- Confirm unchanged route, access, API, and mutation behavior through relevant regression checks.

## Out of Scope

- New features, API changes, dark mode, speculative redesign, or changes to established behavioral contracts.
- Exhaustive browser permutations or pixel-perfect snapshot coverage.

## Acceptance Criteria

- [ ] Every current route is reviewed and any concrete Phase 6 visual inconsistency or usability barrier found is fixed or recorded with a reason it cannot be fixed in this phase.
- [ ] Representative non-happy states retain their controls and meaning in the visual system.
- [ ] At 320px and 200% zoom, primary content and actions remain reachable without horizontal loss; keyboard focus and reading order remain clear.
- [ ] Text and control contrast, status distinctions, and reduced-motion behavior meet the Phase 6 guardrails.
- [ ] The audit record names checked routes, states, viewports, findings, fixes, and verification results.

## Testing Strategy

### Unit Tests

- None required unless a concrete presentation defect introduces pure logic.

### Integration Tests

- Add focused regression coverage only for interaction or semantic defects actually fixed; run the relevant existing suite.

### Manual / Smoke Verification

- Perform and record the cross-route browser pass at desktop, 320px, 200% zoom, keyboard-only use, and reduced-motion setting.

### Explicitly Not Required

- Large screenshot baselines, static-markup snapshots, and duplicated tests of unchanged API behavior.

## Implementation Notes

Keep fixes tied to observed Phase 6 issues. Do not use the audit to reopen product behavior or add a broad new styling architecture.

## Definition of Done

- [ ] Acceptance criteria and the audit record are complete.
- [ ] Relevant tests, lint, build, and `git diff --check` pass.
- [ ] No known regression exists in touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Complete the outstanding human browser/live-backend checks in the [manual verification guide](../../phase-6-manual-verification.md) and record sign-off before marking the ticket or phase Completed. The audit distinguishes the completed implementation checks from these remaining tasks.
