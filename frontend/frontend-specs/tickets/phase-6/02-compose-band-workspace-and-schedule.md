# Compose the band workspace and schedule

> **Status:** For Review
> **Draft PR:** [#45](https://github.com/CaelanRT/bandos/pull/45)

## Objective

Make the band workspace and schedule feel like a coherent, legible working page using the reviewed Phase 6 direction.

## Source Specification

[Phase 6 — Visual implementation](../../07-phase-6-visual-implementation.md), sections 3–8.

## Context

The band shell and schedule already work, but their layout is mostly browser default. The datebook ticket supplies the reviewed shared foundation.

## Scope

- Compose band identity, desktop index, workspace navigation, and mobile translation without changing their destinations or access rules.
- Present upcoming and past schedule entries as readable dated rows with aligned metadata and clear event links.
- Style schedule loading, empty, failure, permission-notice, and unavailable-band states that appear within the workspace shell.

## Out of Scope

- Event detail and management belong to ticket 03; people and settings belong to ticket 04.
- New scheduling features, navigation destinations, or permission behavior.

## Acceptance Criteria

- [ ] Given a band schedule, the band context and current section are clear, and dated event entries can be scanned as rows and opened through the existing links.
- [ ] Given empty, loading, failed, or unavailable band data, the existing messages and recovery controls remain visible and usable.
- [ ] Given leader or member access, the existing navigation and action visibility remain unchanged.
- [ ] At narrow widths and 200% zoom, navigation, schedule rows, and actions retain reading order and remain reachable with keyboard and pointer.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Retain existing schedule, navigation, and permission coverage; add a focused test only if markup changes affect behavior.

### Manual / Smoke Verification

- Inspect populated, empty, loading/error, leader/member, and mobile schedule views; check focus, 320px, and 200% zoom.

### Explicitly Not Required

- Static visual snapshots.

## Implementation Notes

Use the reviewed datebook tokens and index/row principles. Preserve the existing menu's open, close, Escape, and focus behavior.

## Definition of Done

- [ ] Acceptance criteria are satisfied.
- [ ] Relevant existing tests, lint, build, and `git diff --check` pass.
- [ ] No known regression exists in touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Tickets 03 and 04 extend the band workspace to its remaining routes.
