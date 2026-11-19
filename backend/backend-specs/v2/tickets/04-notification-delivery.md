# BE-V2-04 — Deliver preference-controlled email through a recoverable outbox

> **Status:** Not started
> **Dependencies:** [01](01-relational-storage.md), [02](02-bounded-sessions.md), [03](03-mutation-concurrency.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3, 5–6
> **Contract:** [Shared contract](../00-shared-contract.md), sections 7, 9

## Outcome

Domain transactions can enqueue durable email effects, and users can control notification categories without affecting account security messages.

## In scope

- Implement GET/PUT `/users/me/notification-preferences` with version and all boolean fields: enabled, invitations, eventUpdates, removalsAndCancellations, invitationResponses, pollUpdates, pollResponses.
- Add transactional effect insertion unique by transition/kind/recipient and a bounded PostgreSQL-leased dispatcher in the existing app process, safe across instances and restarts. Use a fake adapter in automated tests and Resend for runtime delivery.
- Implement queued/sending/sent/suppressed/retryable/failed/delivery_unknown states, provider ID/key, fingerprint, attempt count/time and sanitized operational evidence.
- Before first dispatch resolve the current leader where applicable, active recipient and preferences; then freeze address/rendered payload for identical retries. Security messages use explicit old/new-address rules and bypass preferences.
- Encrypt temporary raw-token outbox payloads using an application-held key; suppress obsolete security messages before initial dispatch, expire/clear secret payloads on terminal handling. Escape user text and derive links from trusted configured application origin.

## Acceptance criteria

1. All switches default true; master-off preserves category choices. Stale preference writes fail and no-ops leave the version unchanged. Preferences change mail only, never domain permissions or assignments.
2. Category/master opt-outs suppress effects terminally before first dispatch; opting in later sends no suppressed backlog. Active former members can still receive removal notices.
3. Stable `bandos-notification/<notificationId>` keys and frozen payloads are reused for transient failures/timeouts. Retry schedule is immediately, 1m, 5m, 30m, 2h, 6h, 12h from first attempt with bounded jitter and a hard stop before 23h; provider retry timing stays within that bound.
4. Permanent address/validation failures become failed. Ambiguous sends beyond the safe window become delivery_unknown and are not blindly resent; later retry requires proof the original was not accepted.
5. Lease recovery after restart and multiple dispatchers cannot create duplicate effects. Provider acceptance means sent, not guaranteed inbox delivery.
6. Provider outage cannot roll back committed domain success. Logs contain no passwords, raw tokens, private reasons or provider secrets; no mail dashboard or external queue is added.

## Verification

Run focused table-driven preference/category cases and fake-provider tests for suppression, current-leader resolution, rollback, outage/restart/lease recovery, frozen retries and uncertain delivery past the window. Test encrypted token lifecycle and trusted escaped link rendering. Domain-specific triggers are verified in their owning tickets. Covers V2-10.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
