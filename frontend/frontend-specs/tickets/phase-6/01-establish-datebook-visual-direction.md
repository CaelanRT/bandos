# Establish the visual direction in the personal datebook

> **Status:** For Review
> **Draft PR:** [#44](https://github.com/CaelanRT/bandos/pull/44)

## Objective

Give the personal datebook a reviewed, usable visual identity that becomes the baseline for Phase 6's remaining routes.

## Source Specification

[Phase 6 — Visual implementation](../../07-phase-6-visual-implementation.md), sections 1–5 and 7–9; [design language](../../../../artifacts/design-language.md), sections 4–12 and 20–26.

## Context

The functional datebook, global band index, and mobile menu exist with only access and narrow-width safety styling. This is the first visual slice and the checkpoint for later tickets.

## Scope

- Establish shared colors, IBM Plex Sans typography, spacing, rules, form/control basics, focus, and responsive foundations using the Phase 6 spec.
- Compose the protected home/datebook, global band index, featured next event, later-event index, and the no-bands/no-upcoming-events views.
- Style datebook loading and partial-failure states, actions, and links.
- Review the result in a browser at desktop and narrow widths, record decisions or adjustments in the Phase 6 spec, and use the reviewed result as the later-route baseline.

## Out of Scope

- Styling band subroutes, event management, Account, authentication, and recovery, which belong to later tickets.
- New datebook behavior, backend data, dark mode, artist imagery, and a second type family.

## Acceptance Criteria

- [ ] Given a populated datebook, the next event is the clear primary object and later events form a readable chronological index without duplicating the featured event or wrapping every row in a card.
- [ ] Given no bands, no upcoming events, loading, or partial failure, the current guidance and recovery actions remain clear and operable in the new visual system.
- [ ] The global index, mobile menu, links, and focus states use the shared warm-paper, IBM Plex Sans, dark oxblood language while preserving existing navigation and keyboard behavior.
- [ ] At desktop, 320px, and 200% zoom, the datebook hierarchy and controls remain readable and reachable.
- [ ] A browser review of the datebook is recorded before tickets 02–06 use the visual direction; any agreed token adjustment is reflected in the Phase 6 spec.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Add focused coverage only if a changed structure affects navigation, state, or interaction; retain the existing datebook and menu tests.

### Manual / Smoke Verification

- Review populated and non-happy datebook states in a browser at desktop, 320px, and 200% zoom; check keyboard focus and mobile menu. Record the visual checkpoint result.

### Explicitly Not Required

- Static-markup snapshots or pixel-perfect screenshot tests.

## Implementation Notes

Preserve the existing datebook data grouping and route targets. The graphic ink begins at `#743C32`; check its actual use against the paper and surface backgrounds. IBM Plex Sans should have a readable fallback.

## Definition of Done

- [ ] Acceptance criteria and the browser checkpoint are complete.
- [ ] Relevant existing tests, lint, build, and `git diff --check` pass.
- [ ] No known regression exists in touched behavior and no out-of-scope work was introduced.

## Follow-up Work

Tickets 02–06 apply the reviewed direction to the remaining routes; ticket 07 performs cross-route QA.
