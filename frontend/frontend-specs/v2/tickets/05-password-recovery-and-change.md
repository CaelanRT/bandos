# FE-V2-05 — Add password recovery and authenticated password change

> **Status:** In Progress
> **Dependencies:** [FE-V2-04](04-registration-and-verification.md)
> **Created:** 25 November 2026

## Objective

Add /forgot-password, /reset-password, Login recovery link and an explicit Account password-change form.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 8–10; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 9–10; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). The [sequence and shared delivery rules](00-ticket-sequence.md) and [reconciliation decisions](../01-implementation-reconciliation.md) apply to this ticket.

## Current implementation and scope

No forgot/reset/change password workflow exists. Reuse entry form controls, token handling from ticket 04 and session clearing from ticket 02.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/features/auth/LoginForm.jsx](../../../../frontend/src/features/auth/LoginForm.jsx)
- [frontend/src/features/auth/PasswordVisibility.jsx](../../../../frontend/src/features/auth/PasswordVisibility.jsx)
- [frontend/src/features/account/Account.jsx](../../../../frontend/src/features/account/Account.jsx)
- [backend/controllers/password.controller.js](../../../../backend/controllers/password.controller.js)
- [backend/middleware/validate-auth.js](../../../../backend/middleware/validate-auth.js)

## Acceptance criteria

- [x] Forgot request POST /auth/password/forgot sends {email} and uses the server generic confirmation for known/unknown/inactive addresses; honor 429/Retry-After and distinguish MAIL_UNAVAILABLE without claiming issuance.
- [x] Reset captures/strips token in memory with no-referrer and explicit submission. New password/confirmation use shared eight-character/72-byte validation and accessible visibility controls; confirmation stays client-local.
- [x] POST /auth/password/reset sends only {token,newPassword}. Success clears sensitive/protected state and shows Password reset. Log in again.; never auto-login or imply verification.
- [x] Account POST /users/me/password sends {expectedVersion,currentPassword,newPassword} with keyed intent. Wrong current password stays a field error; stale version requires explicit recovery.
- [x] Successful change signs this device out, explains all-device revocation and requires login. Neither reset nor change persists password drafts across navigation/session changes.
- [x] Invalid/expired/used reset tokens offer a fresh request; successful replacement explains newest-link-only. Do not automatically retry token consumption or equate a used-token retry with an uncommitted first attempt.

## Verification

Component/integration checks for generic recovery, exact bodies/key exemption, UTF-8 bounds, mismatch, wrong password versus expiry, issuance failure, reset/change session clearing and explicit token confirmation. Smoke signed-out and signed-in reset links.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Follow the sequence’s definition of done and record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.

## Implementation verification — 26 November 2026

Implemented recovery/reset screens and the Account password-change form against the delivered endpoints. Passwords and reset tokens remain in component memory. Auth requests omit idempotency keys; Account changes use frozen versioned intents with explicit stale recovery and guarded pending/uncertain navigation. Successful reset/change clears protected session/query state and requires login.

From `frontend/`:

- `npm test -- src/__tests__/passwordRecovery.test.jsx src/__tests__/sessionAccess.test.jsx src/__tests__/account.test.jsx src/__tests__/deactivateAccount.test.jsx src/__tests__/sessionLifecycle.test.jsx src/__tests__/registration.test.jsx src/__tests__/registrationFailures.test.jsx src/__tests__/login.test.jsx src/__tests__/loginFailures.test.jsx src/__tests__/registrationValidation.test.js src/__tests__/mutationIntent.test.jsx src/__tests__/apiClient.test.js` — PASS, 12 files / 171 tests, including 18 password recovery/change integration cases.
- `npm run lint` — PASS, no warnings.
- `VITE_API_ORIGIN=http://localhost:3000 npm run build` — PASS.
- `git diff --check` and `git diff --cached --check` — PASS.
- Independent `review-ticket` subagent review — PASS after addressing the pending/uncertain password-change navigation guard finding. No remaining blocking or non-blocking findings.

Outstanding manual verification: browser smoke of signed-out and signed-in reset links. No browser tooling is available in this environment; automated route integration covers both states. No live backend or real mail-delivery checks are claimed.
