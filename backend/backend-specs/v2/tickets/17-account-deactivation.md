# BE-V2-17 — Deactivate accounts only after resolving leadership obligations

> **Status:** Not started
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [06](06-password-recovery.md), [07](07-profile-email-change.md), [16](16-band-lifecycle.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–4, 6–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2, 8–9

## Outcome

An account can deactivate safely across all bands without abandoning leadership, leaving partial memberships or retaining live credentials.

## In scope

- Replace the existing DELETE `/users/me` behavior with validated `{expectedVersion,password}`, current credential verification and shared idempotency.
- Lock affected accounts/bands/resources in the approved order, discover and recheck active ownership obligations and reuse the membership-removal transaction across every current band.
- Atomically soft-deactivate, remove all memberships/future assignments/open-poll participation, invalidate applicable defaults and tokens, advance session generation and queue removal effects. Preserve historical display facts.

## Acceptance criteria

1. If any active owned band exists, return `409 LEADERSHIP_TRANSFER_REQUIRED` with only the actor's blocking bands and no partial account/band/notification effects.
2. Credential/version/validation/session failures preserve the entire account state; deactivation credential failure follows shared INVALID_CREDENTIALS behavior.
3. After leadership is resolved, all current memberships, future event invitation statuses and open-poll rows/votes retire in one commit; past and closed-poll records remain stored.
4. Every session and applicable token is revoked. In-flight old-session writes cannot commit afterward; cleanup of cookie/session rows cannot undo committed deactivation.
5. Removal effects obey recipient active-state rules at dispatch: a deactivated recipient is not sent ordinary notification mail. No former membership grants resource access.
6. Concurrent ownership transfer/member removal/deactivation cannot strand a leader or partially remove only some bands; retries create no extra retirement/mail effects.

## Verification

Test blocked leader deactivation with multiple bands, wrong password/stale version, allowed multi-band removal and a forced mid-transaction failure. Verify history, revoked sessions/tokens, active-recipient suppression and races with transfer/old-session writes. Covers V2-07, V2-11 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
