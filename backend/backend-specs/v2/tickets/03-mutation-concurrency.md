# BE-V2-03 — Add transactional versions and safe idempotent mutations

> **Status:** Not started
> **Dependencies:** [01](01-relational-storage.md), [02](02-bounded-sessions.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–4, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–3

## Outcome

An uncertain retry replays one committed action, while stale or unauthorized requests produce no domain or notification effects.

## In scope

- Introduce small reusable transaction/version/idempotency helpers within current Express/controller patterns; no generic workflow engine.
- Require UUID `Idempotency-Key` on creates, event saves/responses/deletion, membership removal, ownership transfer, band deletion, poll mutations/finalization and account state mutations; integrate these helpers in each later domain ticket.
- Scope records by actor/method/path/key; hash canonical requests without storing plaintext submitted passwords/tokens. Commit replay status/body with domain effects and retain records seven days.
- Use the specified lock order: affected users ascending, bands ascending, resources ascending, then assignments/vote rows. Recheck current authorization, session, expected versions and time after locking.
- Standardize strict safe-integer route/body IDs, unknown-key rejection on changed routes, structured malformed-JSON/field errors and successful no-op handling.

## Acceptance criteria

1. Authenticate and recheck access before replay; replay committed success before stale-version validation. Access loss never reveals a stored privileged representation.
2. Same key/body replays original status/body without extra effects; changed body returns `IDEMPOTENCY_KEY_REUSED`; a concurrent in-flight request receives `REQUEST_IN_PROGRESS` or the completed replay as appropriate.
3. Semantic changes increment the affected aggregate only. Normalized no-ops preserve versions and enqueue nothing; stale/permission/validation failures roll back entirely.
4. A failed pre-commit transaction has no replayable success. Response loss after commit can be recovered using the original key.
5. Pruning expired replay records cannot prune histories; later domain constraints protect terminal actions after seven days. Any deadlock/serialization retry repeats authorization and boundary checks with the same intent key.

## Verification

Use real PostgreSQL transactions to test concurrent identical keys, changed bodies, response loss, rollback, access loss before replay and stale writes with zero outbox rows. Verify sanitized persistence of sensitive account requests. Domain integration continues in each later ticket. Covers V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
