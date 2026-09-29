# Present event details and management

## Objective

Give event detail and management screens a clear print-inspired hierarchy while keeping editing and destructive actions straightforward.

## Source Specification

[Phase 6 — Visual implementation](../../07-phase-6-visual-implementation.md), sections 3–8.

## Context

Event detail, creation, editing, and deletion are functional within the band workspace. They need to inherit the reviewed band and datebook visual system.

## Scope

- Compose event detail around meaningful event name, date/time, location, and supporting metadata.
- Style event creation and editing fields, validation, pending/success/error feedback, and action groups as predictable working pages.
- Style deletion confirmation and unavailable-event or permission recovery without changing their behavior.
- Translate these screens to narrow widths and zoomed layouts.

## Out of Scope

- Event data, field validation, timezone behavior, permissions, or mutation/recovery logic changes.
- Band member and settings screens, owned by ticket 04.

## Acceptance Criteria

- [ ] Event details have clear hierarchy and preserve all existing information and available actions.
- [ ] Create and edit forms retain recognizable labels, values, errors, Save/Cancel actions, and dirty-navigation recovery.
- [ ] Delete confirmation, pending/uncertain outcomes, permission feedback, and unavailable-event recovery stay legible and operable.
- [ ] Keyboard focus, reading order, 320px layout, 200% zoom, and reduced-motion preferences remain usable.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Retain existing event flow coverage; add a focused test only if a structural change affects an interaction.

### Manual / Smoke Verification

- Review a populated detail, create/edit validation, delete dialog, and one unavailable or denied state with keyboard and narrow viewport.

### Explicitly Not Required

- Duplicate API or form-validation tests and static visual snapshots.

## Implementation Notes

Use the shared tokens and band shell. Decorative layout must not rearrange semantic reading order or make non-interactive blocks appear actionable.

## Definition of Done

- [ ] Acceptance criteria are satisfied.
- [ ] Relevant existing tests, lint, build, and `git diff --check` pass.
- [ ] No known regression exists in touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Ticket 07 checks these surfaces in the full route pass.
