# FE-V2-08 — Create bands with starter or custom instrumentation

> **Status:** For Review ([Draft PR #126](https://github.com/CaelanRT/bandos/pull/126))
> **Dependencies:** [FE-V2-03](03-mutation-intents-and-conflicts.md), [FE-V2-04](04-registration-and-verification.md)
> **Created:** 25 November 2026

## Objective

Extend the existing Create Band page and adapter with a keyboard-operable instrumentation list.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 4, 10; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 4, 10; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). The [sequence and shared delivery rules](00-ticket-sequence.md) and [reconciliation decisions](../01-implementation-reconciliation.md) apply to this ticket.

## Current implementation and scope

CreateBand currently submits only {name}; v2 requires instrumentation and returns band-scoped catalog IDs. Member assignments are a later action.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/features/bands/CreateBand.jsx](../../../../frontend/src/features/bands/CreateBand.jsx)
- [frontend/src/features/bands/api.js](../../../../frontend/src/features/bands/api.js)
- [frontend/src/features/bands/useCreationIntent.js](../../../../frontend/src/features/bands/useCreationIntent.js)
- [backend/middleware/validate-band.js](../../../../backend/middleware/validate-band.js)
- [backend/controllers/band.controller.js](../../../../backend/controllers/band.controller.js)

## Acceptance criteria

- [ ] Fetch GET /instruments for the approved starter catalog. Require 1–50 labelled rows, allow repeated instruments, explain the limit and block a 51st row; no drag-only interaction.
- [ ] POST /bands sends name and instrumentation rows with exactly one of starter instrumentId or custom instrumentName plus explicit label. No event clientKey/slotId shape is sent for these creation rows.
- [ ] Allow custom-only bands and repeated normalized custom names; use returned catalog choices without creating duplicates. Enforce trimmed 1–50 names/labels and existing name validation.
- [ ] No musician assignment is required. Optional leaderInstrumentIds defaults empty and contains only starter IDs; custom leader eligibility is edited later in Members.
- [ ] Save uses one frozen keyed intent; successful creation caches returned band/catalog/template and opens its workspace. Subsequent writes use returned band-scoped instrument IDs, never starter IDs.
- [ ] Retain pending/error/focus, unsaved navigation, safe Cancel origin and creation-to-Members intent behavior. Failure/stale/uncertain outcome follows shared recovery without duplicate creation.

## Verification

Extend createBand/bands tests for repeated and custom-only rows, 1/50/51 limits, starter-to-band ID distinction, optional leader eligibility, keyed retry and cancellation with no writes. Smoke keyboard row addition/removal and narrow widths.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Follow the sequence’s definition of done and record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.
