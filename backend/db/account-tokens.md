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
Password recovery and verified email changes are documented below.

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

## Password recovery and change (BE-V2-06)

- `POST /auth/password/forgot`, `{email}`: identical `202 {data:{message}}`
  for known, unknown and inactive accounts. Normalization, shared address/IP
  limits and mail-configuration checks are account-independent. Only active
  accounts receive a reset link; requesting one never changes account access.
- `POST /auth/password/reset`, `{token,newPassword}`: `200 {data:{message}}`.
  Reset links expire at exactly 30 minutes, are single-use and purpose-bound,
  and use the same generic invalid-token error as verification. Only the newest
  successfully issued link works; failed issuance preserves the prior link.
  Ten failed reset submissions per fifteen minutes/IP are allowed, independently
  of the verification-confirm counter. No session or verification is granted.
- `POST /users/me/password`, `{expectedVersion,currentPassword,newPassword}`:
  requires a full active session and UUID `Idempotency-Key`. Checks the account
  version and current password under the account lock. A wrong current password
  returns `403 CURRENT_PASSWORD_INCORRECT` with a `currentPassword` field detail.
  Both reset and change enforce the registration new-password bounds without
  trimming. Invalid/stale requests leave the account and mail unchanged.

Password reset/change atomically update the hash, increment account version and
session generation, invalidate unused reset tokens and queue one security notice
to the active email address. Security mail bypasses all notification preferences.
The existing dispatcher suppresses obsolete token mail and clears encrypted
payloads at terminal delivery. A repeated reset cannot reuse its consumed token;
a password-change retry with the revoked session cannot repeat the transition.
Generation is authoritative for all-device revocation and prevents stale session
mutations committing after reset. Stored-session deletion and caller cookie
cleanup run after commit; store failure cannot turn a committed change into an
error. A caller signed into another account retains that unrelated session.
Fresh login is required after success. An unverified account stays unverified.

Run `node --test test/password-recovery.integration.test.js` with the disposable
`TEST_PG_ADMIN_URL` above.


## Profile and verified email changes (BE-V2-07)

These authenticated writes require a full session and UUID `Idempotency-Key`.
Replay checks precede version validation and create no new account/mail effects.

- `PATCH /users/me`, `{expectedVersion,username?,firstName?,lastName?}`:
  nonempty strict subset with registration field bounds. Names are trimmed;
  email, password and unknown keys are rejected. Returns `200 {data:{user}}`
  with snake_case user fields. Semantic changes increment account version;
  unchanged saves do not. Stale writes return `409 STALE_VERSION`.
- `POST /users/me/email-change`, `{expectedVersion,currentPassword,newEmail}`:
  returns `202 {data:{user}}`. Checks password and address uniqueness under the
  account lock; wrong password returns the field-level
  `403 CURRENT_PASSWORD_INCORRECT` and preserves the session. Stages the trimmed,
  lowercase pending address, increments version and queues a 24-hour verification
  link there plus a security notice to the old address. The active email still
  controls login and ordinary mail. Saving the existing active/pending address
  is a no-op; use resend for another link. Replacement revokes the former token.
- `POST /users/me/email-change/resend`, `{}`: `202 {data:{message}}`.
  Requires a pending address; accepts no caller-selected address. Shares the
  address/IP issuance limits with verification and recovery. Does not change
  account version; a rejected issuance preserves the existing link.
- `POST /auth/email-change/confirm`, `{token}`: `200 {data:{message}}`.
  Public purpose-bound, single-use confirmation rechecks uniqueness and swaps
  the active address atomically. Clears pending state, increments account version
  and session generation, invalidates unused reset/change credentials and queues
  security notices to old/new addresses. `409 ACCOUNT_CONFLICT` preserves the old
  active address. Invalid/expired/reused/wrong-purpose tokens share
  `400 TOKEN_INVALID_OR_EXPIRED`; ten failed submissions per fifteen minutes/IP
  trigger `429 TOO_MANY_ATTEMPTS` with `Retry-After`.

Confirmation revokes every session, including the confirming session, and clears
its cookie when it belongs to the changed account. It grants no session; fresh
login requires the new active email. Security notices bypass all opt-outs.
Stored-session cleanup is best effort after commit; generation remains authoritative.

Run `node --test test/profile-email-change.integration.test.js` with the disposable
`TEST_PG_ADMIN_URL` above. This covers profile validation, retry/no-op/stale
behavior, pending login/delivery, replacement/resend and shared limits, concurrent
address claims/token consumption, rollback, revocation, and security delivery.


## Account deactivation (BE-V2-17)

`DELETE /users/me` requires a full active session, UUID `Idempotency-Key` and the
strict body `{expectedVersion,password}`. The password is never trimmed. A stale
account version returns `409 STALE_VERSION`; a wrong password returns
`401 INVALID_CREDENTIALS` and leaves the session usable.

Any active owned band blocks the entire operation with
`409 LEADERSHIP_TRANSFER_REQUIRED` and
`error.details.bands: [{bandId,name}]`, containing only the actor's blocking bands.
Transfer ownership or delete those bands before retrying with a new intent key.
Deleted bands do not block deactivation.

Success returns `200 {data:{message:"Account deactivated"}}`. One transaction
removes every current membership, retires all upcoming event invitation statuses
and open-poll assignments (including their active answers), and queues removal
effects using the shared membership-removal helper. Past/exact-start event and
closed-poll records, vote history and display snapshots remain stored. Defaults
retain their mappings and become inapplicable when their musician is unavailable.
The account is soft-deactivated, its pending address is cleared, account version
and session generation advance, and all unused live account tokens are revoked.

Locks and candidate-set rechecks serialize this operation with membership and
ownership changes. All-band cleanup rolls back together on failure. Old-session
writes cannot commit after deactivation. Session-store/cookie cleanup follows
commit and cannot reverse it. Retrying with a revoked session returns
`AUTHENTICATION_REQUIRED`, without new retirement or mail effects. Current access
checks also prevent idempotency replay from restoring former access. Dispatch
suppresses ordinary mail to deactivated recipients and obsolete token messages.

Run `node --test test/account-deactivation.integration.test.js` with the disposable
`TEST_PG_ADMIN_URL` above.
