# BE-V2-07 — Validate profile edits and stage verified email-address changes

> **Status:** Not started
> **Dependencies:** [02](02-bounded-sessions.md), [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [05](05-registration-verification.md), [06](06-password-recovery.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 4, 6–7
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2, 9–10

## Outcome

Users can edit profile fields and change email only after verifying the proposed address, then log in again on every device.

## In scope

- Implement nonempty validated PATCH `/users/me` with expectedVersion and username/firstName/lastName only; preserve established field bounds and snake_case response fields.
- Implement POST `/users/me/email-change`, POST `/users/me/email-change/resend` and POST `/auth/email-change/confirm` using exact contract shapes.
- Require current password at initiation; bind a 24-hour token to the exact pending normalized address. Retain the old active address until successful confirmation.
- Share issuance/submission limits, newest-token replacement, secure storage and idempotency rules. Send pending verification to new address and security notice to old address.

## Acceptance criteria

1. Profile rejects email/password and unknown keys; validation/stale/no-op behavior follows the shared contract. User objects expose no password hashes or token values.
2. Incorrect current password produces the field error without ending the authenticated form session; initial and confirmation-time address conflicts use `ACCOUNT_CONFLICT`.
3. A pending address cannot log in or receive ordinary notifications before confirmation. A replacement pending address invalidates its former pending token; resend targets only the current pending address.
4. Confirmation rechecks uniqueness atomically, swaps the active email, clears pending state and invalidates obsolete reset/change tokens; conflict preserves the old active email.
5. Successful confirmation revokes all sessions including the confirming session and sends security notices to old/new addresses. Fresh login uses the new address; no automatic login occurs.
6. Expired/reused/wrong-purpose confirmation, stale writes and rejected issuance have no account/mail side effects. Security notices bypass opt-outs.

## Verification

Test profile validation, account versions, unchanged active login/delivery during pending state, concurrent target-address claims, newest pending token and confirmation revocation on all devices. Verify exact responses, wrong-password handling, retry safety and shared throttles. Covers V2-11 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
