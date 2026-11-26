# FE-V2-06 — Manage versioned profiles and pending email changes

> **Status:** Completed ([Merged PR #122](https://github.com/CaelanRT/bandos/pull/122))
> **Dependencies:** [FE-V2-04](04-registration-and-verification.md), [FE-V2-05](05-password-recovery-and-change.md)
> **Created:** 25 November 2026

## Objective

Retain profile editing; add active/pending address display, current-password address replacement, pending resend and /verify-email-change.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 8–10; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 9; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). The [sequence and shared delivery rules](00-ticket-sequence.md) and [reconciliation decisions](../01-implementation-reconciliation.md) apply to this ticket.

## Current implementation and scope

Account supports first/last name and username editing; active email is informational. The v2 backend stages email separately and revokes affected-account sessions only after confirmation.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/features/account/Account.jsx](../../../../frontend/src/features/account/Account.jsx)
- [frontend/src/features/account/profile.js](../../../../frontend/src/features/account/profile.js)
- [frontend/src/features/account/queries.js](../../../../frontend/src/features/account/queries.js)
- [backend/controllers/email-change.controller.js](../../../../backend/controllers/email-change.controller.js)
- [backend/utils/account-session.js](../../../../backend/utils/account-session.js)

## Acceptance criteria

- [ ] Profile PATCH sends a nonempty subset of username/firstName/lastName plus expectedVersion and key. Consume new user version, reconcile displayed member names and keep email/password outside PATCH.
- [ ] Show active and pending addresses separately; explain that the old address remains active until verification, with verification to new and security notice to old.
- [ ] Initial/replacement POST /users/me/email-change sends {expectedVersion,currentPassword,newEmail} with key; consume returned {user}, preserving draft/field feedback on wrong password, account conflict or stale state.
- [ ] Pending resend POST /users/me/email-change/resend sends exactly {} with a key, without collecting password/address/version. Retain cooldown and mail-unavailable handling; replace-link copy follows actual successful issuance.
- [ ] Confirmation route captures/strips token, uses no-referrer and an explicit POST /auth/email-change/confirm {token}, without keyed replay assumptions.
- [ ] On success require the affected account to log in with the new address and explain all-device signout. Do not infer an authenticated user from the message-only response; use an authoritative session check when a different account is currently signed in, preserving that unrelated identity as the backend does.
- [ ] Expired/used/conflicting confirmation offers recovery without claiming the active address changed. Uncertain consumption does not trigger automatic resubmission or a false definitive failure.

## Verification

Extend accountProfile/account tests for exact PATCH, initial/replacement versus empty resend payloads, returned versions, wrong current password, staged address, conflict/expiry, different-account confirmation and session reset. Smoke protected Account and direct confirmation links.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Follow the sequence’s definition of done and record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.

## Completion — 26 November 2026

PR #122 was confirmed merged into remote `main` at `a19e568`. Automated verification passed (`npm test` on 9 relevant suites / 98 tests, `npm run lint`, `npm run build`, `git diff --check`, and independent `review-ticket` subagent PASS). Interactive browser smoke of protected Account and direct confirmation links remains documented as unavailable in the headless CLI environment.
