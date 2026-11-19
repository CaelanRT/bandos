# BE-V2-16 — Remove members, transfer sole ownership and delete bands atomically

> **Status:** Not started
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [09](09-member-eligibility-defaults.md), [12](12-event-reads-cancellation.md), [13](13-poll-composition.md), [14](14-poll-availability.md), [15](15-poll-terminal-actions.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–5, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–4, 7–8

## Outcome

Band lifecycle actions immediately update management/access and future participation while preserving historical records.

## In scope

- Implement DELETE `/bands/:bandId/members/:userId`, POST `/bands/:bandId/ownership`, and changed versioned/idempotent band DELETE.
- Build the focused membership-removal transaction reused by account deactivation: select upcoming using one server instant, retire all future event statuses and open-poll assignment/vote generations, remove membership and recompute default applicability.
- Transfer sole ownership/current roles under the band lock, preserving both musicians' eligibility/assignments and old leader membership.
- Band deletion atomically cancels upcoming events/open polls, queues eligible cancellations and removes active access; retain past/closed records.

## Acceptance criteria

1. Only the current leader manages lifecycle and all referenced users belong to the band. The owner cannot be removed via member removal.
2. Removal retires future Pending/Accepted/Declined invitations, clears active open-poll votes/participation and invalidates the default together. Template slots remain; history and closed-poll snapshots survive.
3. Removal mails cover all issued future statuses including Declined and active open-poll assignments; an active former member can receive them despite lost band access.
4. Transfer targets another active current verified member and commits exactly one owner. Old-leader concurrent writes recheck ownership and fail after transfer; still-queued leader notices resolve the new leader at dispatch.
5. Band deletion cancellation recipients are future Pending/Accepted event invitees and all current open-poll invitees, excluding Declined event invitees and already-removed poll invitees; preferences apply.
6. No former member retains list/direct/history access. Cancel/remove races cannot leave active participation or double-notify a retired assignment; stale/idempotent/version/no-op semantics hold.

## Verification

Test member removal across future/past/exact-start events and open/closed polls, default invalidation, old-leader race, queued leader resolution and one-owner integrity. Race cancellation/deletion/removal and verify exact recipient effects and historical retention. Covers V2-07 and lifecycle portions of V2-10/V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
