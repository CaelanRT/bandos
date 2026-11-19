# Registration verification (BE-V2-05)

All routes below use `/api/v1` and strict JSON bodies. Registration retains the
existing fields, normalizes email by trimming/lowercasing, trims names, and never
trims passwords. New passwords require at least eight characters and at most
72 UTF-8 bytes. Login keeps its existing credential validation.

- `POST /auth/register`: `201 {data:{user,session}}`. Atomically stores an active
  unverified account, its restricted original-registration session, and an
  encrypted 24-hour verification email in the outbox. Application resources
  reject that session with `403 EMAIL_VERIFICATION_REQUIRED`.
- `POST /auth/verification/resend`, `{email}`: generic `202 {data:{message}}`
  for active unverified, verified, inactive and unknown addresses. Only an active
  unverified account gets registration mail; pending email changes are never
  resent here. Configure the mail settings documented in [notifications.md](notifications.md).
  Without an encryption key, registration and resend return account-independent
  `503 MAIL_UNAVAILABLE` rather than storing an undeliverable verification link.
- `POST /auth/verification/confirm`, `{token}`: `200 {data:{message,user,session}}`.
  Verifies the account, increments account version/session generation, and
  invalidates its other sessions. Only the original valid matching registration
  session is regenerated and promoted; authentication time and its seven-day
  deadline stay fixed. Otherwise user/session are null and fresh login is needed.
  A different signed-in account is never replaced. Missing, expired (including
  the exact deadline), replaced, consumed and wrong-purpose tokens all return
  `400 TOKEN_INVALID_OR_EXPIRED` with the same message. GET never consumes tokens.

`utils/account-tokens.js` provides purpose-bound generation, digest lookup,
account-before-token locking, atomic replacement/revocation and transactional
outbox enqueueing for registration, recovery and pending-email tickets. Domain
rows contain SHA-256 lookup digests of 32 random bytes encoded as base64url;
raw tokens exist only in encrypted temporary mail payloads. Each caller must
hold the account lock and commit accounting, token changes and effects together.
Password recovery and email-change endpoints remain assigned to tickets 06–07.

Issuance accounting is shared across purposes and includes initial requests,
resends and unknown addresses: 60-second normalized-address cooldown, five per
rolling hour/address, and twenty per rolling hour/IP. Transaction-scoped advisory
locks serialize the counters across processes. Failed registration-confirm
submissions are limited to ten per rolling fifteen minutes/IP/purpose. These
limits return `429 TOO_MANY_ATTEMPTS` with `Retry-After` seconds. Baseline Express
limits remain five registration attempts/hour/IP and ten login attempts/15m/IP.
Rejected issuance preserves the current token. `account_token_attempts` contains
only rate keys/times; entries older than an hour can be pruned during housekeeping.
The schema remains fresh-install only; this ticket adds no migration/backfill.

Verification uses disposable databases, a fixed server clock and a fake provider:

```sh
TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55439/postgres \
  node --test test/registration-verification.integration.test.js
```
