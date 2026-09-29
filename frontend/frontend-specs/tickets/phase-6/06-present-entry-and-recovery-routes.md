# Present entry and recovery routes

> **Status:** Completed
> **PR:** [#49](https://github.com/CaelanRT/bandos/pull/49)

## Objective

Give Login, Registration, and unavailable-destination screens the same visual identity as the working app while keeping their actions direct and predictable.

## Source Specification

[Phase 6 — Visual implementation](../../07-phase-6-visual-implementation.md), sections 3–8.

## Context

Signed-out entry screens and unknown or unavailable routes use a separate app shell or recovery view. They need the reviewed visual foundation without implying new navigation or capabilities.

## Scope

- Compose Login and Registration as clear writing surfaces with restrained identity, labeled fields, actions, and feedback.
- Style signed-out and authenticated Not Found and existing unavailable band/event recovery views.
- Include loading, validation, rate-limit, session notice, and other current entry or recovery states.
- Translate these screens to narrow widths and zoomed layouts.

## Out of Scope

- Authentication/session logic, registration rules, destination handling, new recovery routes, or marketing content.
- Account editing and deactivation, owned by ticket 05.

## Acceptance Criteria

- [x] Login and Registration display the shared Phase 6 identity with clear fields, actions, validation, and loading/error feedback.
- [x] Session notices, password visibility, rate-limit feedback, and protected-destination behavior remain visible and operable where applicable.
- [x] Unknown and unavailable-resource views preserve their current auth-appropriate recovery links and messages.
- [x] These screens remain keyboard operable and readable at 320px and 200% zoom; focus remains visible.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Retain existing entry/session/recovery coverage; add a focused test only if structural changes affect an interaction.

### Manual / Smoke Verification

- Inspect Login, Registration, validation and session feedback, authenticated/signed-out Not Found, and unavailable-resource recovery with keyboard and narrow viewport.

### Explicitly Not Required

- Static visual snapshots or repeated authentication behavior tests.

## Implementation Notes

Preserve route protection and redirects. Use meaningful type and spacing for identity; no new decorative music imagery is needed.

## Definition of Done

- [x] Acceptance criteria are satisfied.
- [x] Relevant existing tests, lint, build, and `git diff --check` pass.
- [x] No known regression exists in touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Ticket 07 checks these routes in the complete pass.
