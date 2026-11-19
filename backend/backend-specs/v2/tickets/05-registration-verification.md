# BE-V2-05 — Verify registration and safely continue the original session

> **Status:** Not started
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
