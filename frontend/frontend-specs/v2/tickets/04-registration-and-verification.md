# FE-V2-04 — Complete restricted registration and email verification

> **Status:** For Review ([Draft PR #118](https://github.com/CaelanRT/bandos/pull/118))
> **Dependencies:** [FE-V2-02](02-session-access-and-activity.md), [FE-V2-03](03-mutation-intents-and-conflicts.md)
> **Created:** 25 November 2026

## Objective

Adapt entry flows and add /verify-email instructions, explicit confirmation and resend. Introduce shared new-password validation reused by ticket 05.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 2, 8–10; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 9–10; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). The [sequence and shared delivery rules](00-ticket-sequence.md) and [reconciliation decisions](../01-implementation-reconciliation.md) apply to this ticket.

## Current implementation and scope

Registration and login currently restore a full application session after success; there is no verification route or resend flow. Registration validates a character maximum rather than UTF-8 bytes.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/features/auth/RegistrationForm.jsx](../../../../frontend/src/features/auth/RegistrationForm.jsx)
- [frontend/src/features/auth/registrationValidation.js](../../../../frontend/src/features/auth/registrationValidation.js)
- [frontend/src/features/auth/LoginForm.jsx](../../../../frontend/src/features/auth/LoginForm.jsx)
- [frontend/src/app/routes.jsx](../../../../frontend/src/app/routes.jsx)
- [backend/controllers/auth.controller.js](../../../../backend/controllers/auth.controller.js)
- [backend/middleware/validate-auth.js](../../../../backend/middleware/validate-auth.js)

## Acceptance criteria

- [x] Registration uses at least eight characters and at most 72 UTF-8 bytes, never trimming/truncating passwords. Login preserves the existing credential contract rather than applying new-password rules.
- [x] Registration/login consume structured user/session responses; restricted users see account email, verification instructions, resend, logout and recovery links, with safe destination retained.
- [x] Capture query token in memory, remove it with history replacement before ordinary navigation, set no-referrer and require Confirm email. GET/mount never consumes it; no storage, telemetry or token return destination.
- [x] POST /auth/verification/confirm with {token}. Continue only from returned full user/session for the original valid matching registration session; null user/session requires login. Missing/expired/mismatched sessions never imply authentication or switch an unrelated account.
- [x] POST /auth/verification/resend with {email}; show generic confirmation and Retry-After cooldown. Successful replacement explains newest-link-only; a rejected request does not claim previous links were revoked.
- [x] Invalid/expired/used links share recoverable feedback and resend path. MAIL_UNAVAILABLE/429 are real failures, not generic success. After uncertain token consumption, explain uncertainty and offer authoritative session check/login/recovery rather than automatically retrying or declaring failure from token reuse.

## Verification

Extend registration/login failures and session tests; cover original-session promotion, null continuation and unrelated signed-in account, explicit-only token POST, history/referrer handling, reload-without-token recovery, resend throttling/mail failure and multibyte passwords around 72 bytes.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Follow the sequence’s definition of done and record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.

## Implementation verification — 26 November 2026

- `npm test` from `frontend/`: **PASS**, 37 files / 495 tests. Includes restricted registration/login, original-session promotion, null continuation with signed-out/restricted/unrelated full sessions, explicit token POST, replaced history, no-referrer, reload recovery, uncertain consumption/session check, throttling/mail rejection, duplicate submission and multibyte password boundaries.
- `npm run lint`: **PASS**, no warnings.
- `VITE_API_ORIGIN=http://localhost:3000 npm run build`: **PASS** (documented local backend origin; no deployment performed).
- `git diff --check`: **PASS**.
- Impeccable detector on changed auth JSX: **PASS**, no findings.

No live backend/email-delivery or browser visual smoke check is claimed. Password recovery remains the existing route scaffold for FE-V2-05.

Independent `review-ticket` review: **PASS** after correcting explicit session-check activity classification; no remaining findings. Reviewer independently reran 4 files / 52 tests and checked the staged diff.
