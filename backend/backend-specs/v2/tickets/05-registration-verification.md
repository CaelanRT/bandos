# BE-V2-05 — Verify registration and safely continue the original session

> **Status:** For Review ([Draft PR #80](https://github.com/CaelanRT/bandos/pull/80))
> **Dependencies:** [01](01-relational-storage.md), [02](02-bounded-sessions.md), [03](03-mutation-concurrency.md), [04](04-notification-delivery.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 4–7
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–3, 9–10

## Outcome

New accounts must verify email, and only the original valid registration session can continue directly into the application.

## In scope

- Implement changed POST `/auth/register`, POST `/auth/verification/resend` and POST `/auth/verification/confirm` with exact shared envelopes and restricted-session behavior.
- Create reusable purpose-bound tokens from at least 32 random bytes, URL-safe encoding and SHA-256 lookup digests; bind exact target address when applicable. Consume/revoke under account/token locks.
- Implement shared normalized-address issuance accounting across registration verification, pending email verification and recovery: 60-second cooldown and 5/hour including initial requests/resends, equivalent unknown-address accounting, plus approved 20/hour/IP limit.
- Keep baseline 5 registrations/hour/IP and 10 login attempts/15m/IP. Limit failed confirm submissions to 10/15m/IP/purpose. Return generic request confirmations, `429` and Retry-After without account-existence leaks.
- Apply consistent new-password bounds (minimum eight characters, maximum 72 UTF-8 bytes), no password trimming, existing email normalization and registration/profile limits.

## Acceptance criteria

1. Registration atomically creates an active unverified account, restricted original-registration session and queued 24-hour verification message. Main resources remain blocked.
2. Replacement issuance revokes prior unused tokens for the same account/purpose atomically; rejected/rate-limited issuance preserves the current token.
3. Missing/expired/revoked/used/wrong-purpose tokens return identical `TOKEN_INVALID_OR_EXPIRED`; expiry uses now >= expiresAt. Concurrent consumption has at most one success; GET links never consume.
4. Confirmation verifies the account, advances generation and revokes other restricted sessions. The original matching valid registration session alone is regenerated/promoted, preserving authenticatedAt and the original seven-day deadline.
5. Missing, expired, mismatched or later restricted-login sessions do not create/switch authentication; confirmation returns null user/session and requires login.
6. Raw tokens exist only in encrypted temporary mail payloads; no user representation or telemetry exposes them. Registration resend never issues an email-change token.

## Verification

Test verification issuance/replacement/expiry/reuse and concurrent confirm using an isolated database, fake mail and fixed clock. Cover valid original continuation, original absolute-deadline preservation and absent/expired/different-account/later-login sessions. Test multibyte password boundaries and equal known/unknown throttle patterns. Covers V2-11.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.

## Implementation evidence

- Added strict registration verification resend/confirm routes, atomic registration
  account/session/token/outbox persistence, 24-hour hashed purpose-bound tokens,
  account/token locks and atomic replacement/revocation.
- Confirmation verifies and increments account version/generation, revokes other
  sessions, and regenerates only a valid original registration session while
  retaining its authentication instant and absolute deadline. Other confirmations
  return null user/session without switching a different signed-in account.
- Shared durable issuance accounting covers normalized addresses, unknown accounts
  and IPs; failed confirmations have their own IP/purpose counter. Registration
  and login retain baseline limits. New passwords use the approved UTF-8 byte bound.
- Runtime behavior, helper contract, mail requirement and fresh-schema-only scope:
  [account-token reference](../../../db/account-tokens.md).
- `TEST_PG_ADMIN_URL=... node --test test/registration-verification.integration.test.js test/bounded-sessions.integration.test.js test/notification-delivery.integration.test.js test/notification-mail.test.js test/mutation-concurrency.integration.test.js test/mutation-validation.test.js test/relational-storage.integration.test.js test/runtime-config.test.js test/frontend.integration.test.js`:
  **60 tests passed**, using disposable PostgreSQL databases, a fixed clock and fake
  mail. Ticket tests cover replacement/rejection/rollback, expiry/reuse/purpose,
  concurrent confirm/resend, all specified continuation/session cases, absolute
  deadline preservation, known/unknown throttling and password byte boundaries.
- `node --test test/runtime-security.integration.test.js`: **3 tests passed**
  against an isolated TLS-enabled database, with fake mail for registration.
- `node --test test/readiness-shutdown.integration.test.js`: **4 smoke checks
  passed** against the dedicated disposable readiness container.
- `git diff --check` and changed JavaScript syntax checks passed. No backend npm
  test/lint/build/typecheck scripts are defined. Recovery/email-change endpoints
  remain assigned to tickets 06–07.
- Independent `review-ticket` review: **PASS**, every acceptance criterion passed,
  no blocking or non-blocking findings. The reviewer independently ran the nine
  registration tests and `git diff --check` successfully.
