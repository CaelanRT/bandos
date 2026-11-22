# Notification delivery foundation (BE-V2-04)

GET/PUT `/api/v1/users/me/notification-preferences` require a full verified session.
PUT accepts `expectedVersion` and all seven booleans, rejects unknown fields, and
returns `{data:{preferences}}`. Preference writes use the account lock and session
commit checks. They do not require an Idempotency-Key; their own version and no-op
semantics apply. Missing preference rows read as version 1 with all switches true.
Master-off never rewrites category choices. Preferences affect delivery only.

## Enqueue from a domain transaction

Call `enqueueNotification(client, effect, encryptionKey)` with the transaction's
PostgreSQL client. Domain-owning tickets decide triggers, recipient precedence,
and private content. Rollback removes both domain changes and the effect.

```js
await enqueueNotification(client, {
  transitionId, // UUID for this semantic transition, not the resource ID
  kind: 'event_invitation',
  recipientIdentity: String(musicianId),
  recipientUserId: musicianId,
  category: 'invitations',
  payload: { subject: 'Event invitation', text: 'You have been invited.', path: `/bands/${bandId}` },
});
```

For leader-directed effects use `recipientBandId` instead of `recipientUserId`
and a stable selector identity such as `leader:<bandId>`. The worker resolves the
current owner immediately before the first attempt. Ordinary recipients need an
active account, not current band membership, so removal notices still work.
Uniqueness is `(transition_id, kind, recipient_identity)`; duplicate insertion
returns undefined. Semantic no-ops must not call enqueue.

Security effects replace `category` with `securityPurpose`, retain
`recipientUserId`, and require an explicit `securityAddress` captured by the
account transaction (old address or new address as that transition requires).
Never resolve these notices through the user's later email address. Security
purposes match the schema. Token messages also supply `tokenId`, `token`, and
`tokenExpiresAt` (Date). Pass `config.mail.encryptionKey`. The raw token belongs
only in this encrypted argument, never in payload text/path or ordinary tables.
Store only its digest in `account_tokens`. The worker checks token purpose,
account, target address, expiry, revocation and consumption before first dispatch.
Later account tickets own issuance, replacement/revocation, and confirmation.

Payload version 1 takes plain `subject`, `text`, and an optional application
`path`. HTML is escaped; links resolve only against configured `CLIENT_ORIGIN`.
When sending a token, supply a path without the token: the renderer adds the
encoded `token` query parameter. Paths come from application code; no request
Host, external URL, provider credentials, passwords, or raw tokens belong here.
Tokens and complete frozen security requests use AES-256-GCM with random nonces.
Expired secrets are cleared when the worker next polls, even if their retry was
scheduled later. Terminal states clear ciphertext, expiry and frozen security
content. Fingerprints retain a digest, not the secret request.

## Runtime and recovery

Set all three environment values to enable delivery in the existing app process:

- `RESEND_API_KEY`: private Resend API key.
- `EMAIL_FROM`: sender email address authorized in Resend.
- `OUTBOX_ENCRYPTION_KEY`: base64-encoded 32 random bytes, e.g. generated using
  `openssl rand -base64 32`. Keep it in application secret configuration.

Without these settings the API runs with dispatch disabled; durable rows remain
queued. Partial/invalid configuration fails startup without printing secrets.
Use the same encryption key on every instance and retain it through restarts
while pending encrypted rows exist. No development plaintext fallback exists.
Deploy with these settings before enabling security-token issuance.

Each worker processes at most ten effects per tick, sequentially, then polls in
one second. Row locking/SKIP LOCKED and 60-second leases coordinate instances.
The runtime provider request times out at ten seconds. Shutdown stops polling and
waits for active work before closing PostgreSQL; the existing shutdown deadline
still applies. A crash leaves a recoverable lease. Completion uses a unique lease
claim ID so an older worker cannot overwrite a reclaimed result.

The first claim checks active recipient/preferences (security bypasses switches),
then commits a frozen recipient, rendered request, fingerprint and provider key
`bandos-notification/<notificationId>` before sending. Later attempts reuse the
same request/key, even after preference, leadership or email changes. Canonical
JSON serialization keeps provider bytes stable across JSONB round trips.
Suppression is terminal; later opt-in sends no backlog.

Attempts are due at 0, 1m, 5m, 30m, 2h, 6h and 12h from the first claim, with up to
10% positive jitter capped at one minute. Delayed workers wait at least one minute
between attempts. Retry-After can delay an attempt only within the safe window.
Requests stop ten seconds before 23h, reserving the provider timeout. Retryable
failures after seven attempts or beyond this window become `delivery_unknown`.
Permanent address/payload rejection becomes `failed`. Provider acceptance is
`sent`, meaning accepted by Resend, not guaranteed inbox delivery. The provider
adapter never exposes raw failure bodies to logging or persistence.

Inspect sanitized state, notification ID, attempt timestamps/count, provider ID,
request fingerprint, and last error class using existing database operations.
No dashboard, external queue, webhooks, or user retry endpoint is introduced.
`delivery_unknown` is terminal for automatic dispatch. Never reset it or mint a
new notification/key without independent provider evidence that the original
request was not accepted. Resend's idempotency window is bounded; elapsed time or
a missing local provider ID is not that evidence. Provider reconciliation is an
operator responsibility when available, not an automatic blind resend path.

Registration, verification resend, password/email-change security flows and
event/poll lifecycle triggers enqueue through this outbox. See
[account/token behavior](account-tokens.md) and the
[current runtime reference](../backend-specs/v2/02-runtime-api.md).

## Verification

Use a disposable PostgreSQL admin URL as described in `db/README.md`:

```sh
TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55439/postgres \
  node --test test/notification-delivery.integration.test.js test/notification-mail.test.js
```

All provider calls are fakes. No real email credentials or inbox are required.
Resend protocol references: [send email](https://resend.com/docs/api-reference/emails/send-email)
and [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
