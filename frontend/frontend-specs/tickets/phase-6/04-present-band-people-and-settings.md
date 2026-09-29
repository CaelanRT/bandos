# Present band people and settings

## Objective

Make band creation, the member index, member addition, and settings coherent working pages within the band visual system.

## Source Specification

[Phase 6 — Visual implementation](../../07-phase-6-visual-implementation.md), sections 3–8.

## Context

These existing routes share the band context but mix an index with several high-frequency forms and confirmations.

## Scope

- Present members as a compact, legible index with role and identity information.
- Style band creation, member addition, band name/settings, and band deletion surfaces, including their forms, notices, validation, errors, and confirmations.
- Preserve clear leader/member action visibility and mobile/zoom usability.

## Out of Scope

- New membership or band-management features, backend behavior, permissions, or form rules.
- Schedule and event surfaces, owned by tickets 02 and 03.

## Acceptance Criteria

- [ ] The member page is scannable as a row/index view and preserves names, usernames, roles, and applicable actions.
- [ ] Creation, member addition, settings, and deletion retain clear labels, current feedback, and explicit actions.
- [ ] Leader-only controls remain visible only where already permitted; permission and recovery states remain understandable.
- [ ] Forms and confirmations remain keyboard operable and readable at 320px and 200% zoom.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Retain existing band and membership coverage; add focused coverage only for an interaction affected by new structure.

### Manual / Smoke Verification

- Inspect member/leader views, populated members, creation and validation, settings, and deletion confirmation with keyboard and narrow viewport.

### Explicitly Not Required

- Static visual snapshots or duplicate validation tests.

## Implementation Notes

Use the shared visual foundation and band shell. Keep forms visually straightforward and use rules or alignment before extra cards.

## Definition of Done

- [ ] Acceptance criteria are satisfied.
- [ ] Relevant existing tests, lint, build, and `git diff --check` pass.
- [ ] No known regression exists in touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Ticket 07 checks these surfaces in the full route pass.
