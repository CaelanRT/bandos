# BE-V2-06 — Add generic password recovery and all-session password revocation

> **Status:** Completed ([merged PR #82](https://github.com/CaelanRT/bandos/pull/82))
> **Dependencies:** [02](02-bounded-sessions.md), [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [05](05-registration-verification.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 4, 6–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2, 9–10

## Outcome

Users can recover or change a password without leaking account existence, implicitly verifying an account or retaining old sessions.

## In scope

- Implement POST `/auth/password/forgot`, POST `/auth/password/reset` and POST `/users/me/password` with exact shared requests/envelopes; use token, throttle and encrypted delivery primitives from ticket 05.
- Issue 30-minute reset tokens with newest-link-only semantics; share normalized-address counters with verification and apply the approved IP/failed-confirm limits.
- Verify logged-in currentPassword against the locked account, expected account version and active session; enforce the same bcrypt/new-password validation as registration.
- Atomically update hash/version, invalidate reset tokens, increment generation and enqueue security confirmation. Remove stored sessions/clear caller cookie where practical.

## Acceptance criteria

1. Forgot-password returns identical `202` confirmation and comparable work/rate behavior for known, unknown and inactive addresses; requests never lock/deactivate the account.
2. Reset tokens are purpose-bound, single-use and expired exactly at 30 minutes; replaced/used tokens fail generically. Rejected issuance leaves the current link valid.
3. Incorrect current password returns field-level `403 CURRENT_PASSWORD_INCORRECT`; invalid new passwords or stale versions change nothing.
4. Successful password reset/change revokes every session including the caller and prevents racing old-session commits. Post-commit cleanup failure cannot falsely report the committed password change as failed.
5. Reset never signs in or verifies an unverified user. Security confirmation bypasses every notification preference; retry cannot repeat password or mail effects.

## Verification

Test generic requests and shared throttles, purpose/expiry/reuse/concurrent consumption, current-password failure, all-device revocation and revoked-session races. Verify encrypted-token cleanup, multibyte password bounds, reset-without-login and unverified-account reset behavior. Covers V2-11 through V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.

## Implementation evidence

- Added generic recovery requests, newest-only 30-minute reset tokens, shared
  normalized-address/IP issuance limits and purpose-specific failed-reset limits.
- Password reset/change commit the hash, account version, generation revocation,
  reset-token invalidation and preference-independent security notice together.
  Current-password/version/session checks run under the account lock; post-commit
  session-store failure preserves success. Reset never signs in or verifies.
- API and runtime behavior: [account-token reference](../../../db/account-tokens.md).
- Standard regression command: `TEST_PG_ADMIN_URL=... node --test
  test/password-recovery.integration.test.js test/registration-verification.integration.test.js
  test/bounded-sessions.integration.test.js test/notification-delivery.integration.test.js
  test/notification-mail.test.js test/mutation-concurrency.integration.test.js
  test/mutation-validation.test.js test/relational-storage.integration.test.js
  test/runtime-config.test.js test/frontend.integration.test.js`: **69 tests passed**
  against disposable databases, fixed clocks and fake mail. Includes generic
  known/unknown/inactive requests, shared cooldown/hour/IP limits, rollback and
  replacement, exact expiry/purpose/reuse/concurrent consumption, byte bounds,
  current-password/stale-version rejection, revocation, a preauthenticated write
  racing reset, post-commit cleanup failure and encrypted-token cleanup.
- `node --test test/runtime-security.integration.test.js`: **3 passed** using a
  disposable TLS database and fake registration mail.
- `node --test test/readiness-shutdown.integration.test.js`: **4 passed** using
  the dedicated disposable readiness container.
- Changed JavaScript syntax checks and `git diff --check` passed. No backend npm
  test/lint/build/typecheck scripts are defined. Email change and deactivation's
  domain cleanup remain assigned to their later tickets.
- Independent `review-ticket` review: **PASS** for every acceptance criterion,
  with no blocking or non-blocking findings. The reviewer independently reran
  the nine recovery tests, syntax checks and `git diff --check` successfully.
