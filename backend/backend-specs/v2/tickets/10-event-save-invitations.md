# BE-V2-10 — Save event lineups and issue invitation changes atomically

> **Status:** Not started
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [08](08-band-catalog-template.md), [09](09-member-eligibility-defaults.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 2–5, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–5, 7, 10

## Outcome

One event save persists the selected partial lineup and issues only the resulting invitations/removals, with stable identities for unchanged assignments.

## In scope

- Extend existing event create/PATCH handlers and validators using shared event fields and slot shapes. Check templateVersion on create and event expectedVersion on edit.
- Persist ordered event-local snapshot slots with nullable immutable templateSlotId provenance, resolved UTC instants, version and hideFromUninvited. Return persisted IDs/client-correlated validation errors.
- Treat supplied slots as replacement collection, omitted slots on PATCH as untouched, explicit null userId as empty, and missing userId as invalid. New slots use UUID clientKey.
- In one transaction retain unchanged invitation identities/statuses, retire removed/replaced assignments and issue fresh Pending invitations. Revalidate new assignments; unchanged issued assignments survive eligibility removal.
- Enqueue invitation/removal effects with recipient-specific deduplication. No separate send API, unsent database state or implicit default assignment.

## Acceptance criteria

1. Partial lineups with 1–50 slots and empty slots can save; one musician cannot occupy two slots. Only current leader can save; assigned musicians are active current eligible band members.
2. Replacing/moving a musician or changing the assigned instrument creates a fresh invitation; unchanged slot/user/instrument preserves identity. Existing slot templateSlotId cannot be rewritten.
3. Before save no assignment change is visible or emailed. On commit new musicians are Pending; removed identities retire with history. Removal emails include Declined assignments.
4. At or after the stored start, detail/lineup writes fail EVENT_STARTED even when the proposed date is future. Schedule resolution preserves same-day/DST behavior.
5. Stale template/event versions, foreign IDs, validation, session loss and transaction failure create no invitation/mail effects. Same-key retry returns the committed representation once.
6. Return the shared privacy-filtered event representation; decline reasons never leak to unauthorized readers. Detailed read/response coverage follows in tickets 11–12.

## Verification

Test partial save, unchanged/replaced/moved identities, explicit null/omitted collections, duplicate/cross-band/ineligible selections, grandfathered assignments, rollback and lost-response replay. Include exact-start guard and no-op saves. Covers V2-03, event portions of V2-05 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
