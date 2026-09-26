# Recover from unknown and stale routes

## Objective

A musician reaching an unknown URL or a resource that became unavailable can find an appropriate destination without seeing stale private content or unsupported actions.

## Source Specification

[Phase 5 — Account and resilience](../../06-phase-5-account-and-resilience.md), section 5 and related criteria in section 7.

## Context

The catch-all currently shows only a heading. Band and event routes already have resource-specific recovery; this ticket closes concrete gaps at route and stale-access boundaries without replacing those established flows.

## Scope

- Give generic Not Found an auth-appropriate recovery link: personal datebook when authenticated, Login when signed out.
- Preserve known band/event route handling for malformed, missing, deleted, or inaccessible IDs.
- Review stale band access, event existence, and leader permission boundaries in the existing route flow; fix any demonstrable case that leaves a usable stale workspace, missing-event detail, or management action visible after authoritative denial.
- Keep affected caches and navigation consistent with the existing feature-specific recovery patterns.

## Out of Scope

- Account profile and deactivation flows belong to tickets 01 and 02.
- General visual and keyboard audit belongs to ticket 04.
- New permissions, mutation replay, broad cache rewrites, or unrelated flow refactors.

## Acceptance Criteria

- [ ] Given an unknown URL while authenticated, Not Found offers a working personal-datebook link; while signed out, it offers Login without private navigation or content.
- [ ] Given a known malformed or unavailable band/event route, the existing band or event recovery appears rather than generic Not Found.
- [ ] Given authoritative loss of band access, event existence, or leader permission after a route loads, the affected screen cannot continue presenting that resource or action as usable and offers the established recovery path.
- [ ] Given a recovery transition, affected private cache and controls update without removing unrelated useful band/event data or automatically repeating a mutation.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Cover authenticated and signed-out unknown routes and each concrete stale-boundary regression fixed by this ticket. Reuse existing band and event tests for already-correct cases.

### Manual / Smoke Verification

- Open unknown and unavailable resource URLs directly and use their recovery links.

### Explicitly Not Required

- Repeating every existing band/event mutation test or testing hypothetical failures not found in the targeted review.

## Implementation Notes

Keep `BAND_NOT_FOUND`, `EVENT_NOT_FOUND`, and `LEADER_REQUIRED` semantics from the Phase 2 and 3 specs. The session boundary already owns `AUTHENTICATION_REQUIRED`; resource recovery must not create a competing session state.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Required tests pass, along with relevant existing tests, lint, production build, and `git diff --check`.
- [ ] No known regression exists within touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Ticket 04 checks these routes in the complete critical journey.
