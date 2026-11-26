# FE-V2-07 — Edit user-wide email notification preferences

> **Status:** Completed ([Merged PR #124](https://github.com/CaelanRT/bandos/pull/124))
> **Dependencies:** [FE-V2-02](02-session-access-and-activity.md), [FE-V2-03](03-mutation-intents-and-conflicts.md)
> **Created:** 25 November 2026

## Objective

Add an explicitly saved Account preference section using GET/PUT /users/me/notification-preferences.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 8–10; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 7, 9; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). The [sequence and shared delivery rules](00-ticket-sequence.md) and [reconciliation decisions](../01-implementation-reconciliation.md) apply to this ticket.

## Current implementation and scope

No preference controls exist. Backend preference rows have an independent version and seven booleans; email effects are already server-owned.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/features/account/Account.jsx](../../../../frontend/src/features/account/Account.jsx)
- [backend/utils/notification-preferences.js](../../../../backend/utils/notification-preferences.js)
- [backend/routes/user.routes.js](../../../../backend/routes/user.routes.js)

## Acceptance criteria

- [ ] Load server defaults and display master enabled plus invitations, eventUpdates, removalsAndCancellations, invitationResponses, pollUpdates and pollResponses with meaningful labels.
- [ ] PUT includes independent expectedVersion and all seven booleans; no Idempotency-Key and no user.version. Save/Cancel, loading, failure and stale reload preserve the distinction between draft and saved settings.
- [ ] Master off disables category editing or clearly marks it inactive while preserving saved category selections; re-enabling restores them.
- [ ] Explain categories are user-wide across bands and security/verification/recovery messages still send. Saving preferences never changes invitation status, access, datebook inclusion or reconfirmation.
- [ ] Success announces saved settings without claiming inbox delivery. No in-app inbox, badge, delivery-status endpoint or per-action suppression is introduced.

## Verification

Small table-driven checks cover all boolean fields, independent version, master preservation, exact PUT without key, stale/network recovery and security-message explanation. Assert opt-out does not mutate event/poll/product data.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Follow the sequence’s definition of done and record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.

## Completion — 26 November 2026

PR #124 was confirmed merged into remote `main` at `f4f7ec3`. Automated verification passed (`npm test` on 8 relevant suites / 86 tests, `npm run lint`, `npm run build`, `git diff --check`, and independent `review-ticket` subagent PASS). Interactive browser smoke of desktop/narrow layout, keyboard navigation, and screen-reader announcements remains documented as unavailable in the headless CLI environment.
