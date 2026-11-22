# BE-V2-18 — Verify the complete backend contract and document delivered behavior

> **Status:** For Review — [Draft PR #110](https://github.com/CaelanRT/bandos/pull/110)
> **Dependencies:** [01](01-relational-storage.md), [02](02-bounded-sessions.md), [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [05](05-registration-verification.md), [06](06-password-recovery.md), [07](07-profile-email-change.md), [08](08-band-catalog-template.md), [09](09-member-eligibility-defaults.md), [10](10-event-save-invitations.md), [11](11-event-response-time.md), [12](12-event-reads-cancellation.md), [13](13-poll-composition.md), [14](14-poll-availability.md), [15](15-poll-terminal-actions.md), [16](16-band-lifecycle.md), [17](17-account-deactivation.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–12

## Outcome

The integrated backend satisfies the approved v2 scenarios, and the runtime API reference accurately describes implemented behavior.

## In scope

- Run a proportionate integrated regression pass over the completed slices using isolated real PostgreSQL, deterministic server time and fake Resend; fix integration defects within approved v2 scope.
- Update affected band/event smoke scripts and account/session fixtures for verified accounts, new envelopes, required instrumentation/versions/idempotency and invitation-based datebook inputs.
- Update the runtime API reference only for implemented/verified behavior, preserving historical context as appropriate; document required application settings for Resend, trusted link origin and temporary-token encryption without provisioning infrastructure.
- Record actual verification commands/results and remaining limitations, using the acceptance map in the sequence index. Coordinate frontend integration against exact shared shapes without owning frontend UI changes.

## Acceptance criteria

1. Every backend obligation in V2-01 through V2-13 has meaningful coverage; V2-14 API recovery support is exercised (structured errors, authorization loss, token/session/stale failures), while browser/accessibility acceptance remains frontend-owned.
2. Integrated flows cover create/configure/default → issue/respond/change/cancel, poll compose/vote/finalize, membership/ownership/deactivation, verification/password/email and bounded-session transitions.
3. Privacy/list/direct/cross-band checks, no-op/stale zero-effects, lost-response replay, terminal actions after replay expiry, generation races and delivery outage/restart remain verified together.
4. Existing relevant backend tests and affected band/event smoke checks pass; frontend-serving/runtime-security checks run for routing/session changes. Use existing runnable project commands rather than claiming nonexistent npm scripts.
5. No real provider call is required by automated tests; results distinguish API save/queue success from mailbox delivery. Unrun/manual/frontend checks are clearly recorded.
6. The runtime reference contains actual routes/envelopes/versions/errors and no speculative implemented claims. No excluded product, migration or deployment work is introduced.

## Verification

Run the existing `node --test` backend tests as applicable after inspecting their environment requirements, affected shell smoke scripts against an isolated running stack, and available project lint/build/type checks where defined. Record exact commands, pass/fail results and environmental gaps; backend/package.json currently has dev/start only. This ticket consolidates cross-feature verification rather than deferring all tests here.

## Implementation evidence

See [verification results and acceptance map](18-verification-results.md) and the
[delivered runtime API reference](../02-runtime-api.md).

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
