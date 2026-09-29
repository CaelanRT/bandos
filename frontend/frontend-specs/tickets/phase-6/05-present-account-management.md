# Present account management

## Objective

Make the account page and deactivation dialog feel consistent with the Phase 6 design while preserving their careful edit and confirmation flows.

## Source Specification

[Phase 6 — Visual implementation](../../07-phase-6-visual-implementation.md), sections 3–8.

## Context

The account form, read-only fields, save recovery, and deactivation dialog are functional but only minimally styled. They can adopt the datebook's reviewed visual foundation independently of band subroute work.

## Scope

- Compose account identity and editable/read-only information with clear distinction.
- Style profile fields, validation and reconciliation feedback, action groups, and dirty-navigation confirmation.
- Style deactivation warning, password field, dialog actions, and pending/uncertain states.
- Translate account and dialog layouts to narrow widths and zoomed layouts.

## Out of Scope

- New profile fields, email/password/plan editing, or changes to save/deactivation behavior.
- Login, Registration, and generic recovery, owned by ticket 06.

## Acceptance Criteria

- [ ] Account information clearly distinguishes editable name/username fields from read-only email and plan without changing supported actions.
- [ ] Save/Cancel, validation, conflict, uncertain-save, and dirty-navigation states remain visible and operable.
- [ ] Deactivation warning and password confirmation remain legible, with clear primary and cancel actions and unchanged focus behavior.
- [ ] Account content and dialogs remain keyboard operable at 320px and 200% zoom.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Retain existing account and deactivation coverage; add a focused test only if structure changes an interaction.

### Manual / Smoke Verification

- Review account, profile errors/success, dirty navigation, and deactivation dialog with keyboard, narrow viewport, and zoom.

### Explicitly Not Required

- Duplicate profile validation tests and static visual snapshots.

## Implementation Notes

Preserve the current form state and dialog semantics. The visual emphasis of deactivation should communicate consequence without using graphic ink as an ambiguous error signal.

## Definition of Done

- [ ] Acceptance criteria are satisfied.
- [ ] Relevant existing tests, lint, build, and `git diff --check` pass.
- [ ] No known regression exists in touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Ticket 07 checks Account in the complete route pass.
