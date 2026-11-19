# BE-V2-13 — Create and edit rehearsal poll compositions with revisioned options

> **Status:** Not started
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [08](08-band-catalog-template.md), [09](09-member-eligibility-defaults.md), [10](10-event-save-invitations.md), [12](12-event-reads-cancellation.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 3–5, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–3, 6–7, 10

## Outcome

Leaders can maintain an open rehearsal poll without losing unaffected answers or creating scheduled events before finalization.

## In scope

- Implement poll POST/list/detail/PATCH routes and exact shared Poll projections, including visibility, ordered snapshot slots, assignment generations, options/revisions and current response rows.
- Use loaded band templateVersion at creation, poll expectedVersion for composition edits, and event slot write validation. Require 1–50 slots, 1–30 distinct resolved ranges and at least one selected musician on create.
- Reuse the canonical schedule resolver for the common poll timezone; preserve IDs/revisions for unchanged options, increment revisions and invalidate only changed-option answers, remove active answers for deleted options.
- Retire removed/replaced musician generations and create blank rows for additions/re-additions. Enqueue correct poll invitation/removal/update effects in the same transaction.

## Acceptance criteria

1. Only current leaders create/edit; list/detail visibility matches event rules, with former members excluded. Hidden/cross-band IDs never disclose a poll; polls create no datebook entries.
2. Create/edit rejects empty or >30 options on options and empty or >50 slots on slots with no effects. Duplicate resolved ranges and foreign IDs are invalid.
3. New/changed options must be future; unchanged elapsed options may remain. Passing all option times leaves the poll open and sends no automatic closure mail.
4. Changed local fields/instants revise only affected options; reorder and representation-only timezone changes retain answers. Timezone changes recompute instants.
5. Removed rows leave active aggregates; replacements/re-additions start blank and inherit no votes. Existing respondents retain unaffected valid answers, with needsResponse true where current answers are missing.
6. Added/changed/deleted options and meaningful timezone changes notify retained invitees; new users receive invitation only and removed users removal only. Metadata-only or label/order-only edits add no new email category.
7. Finalized/cancelled polls reject composition edits with POLL_CLOSED and preserve closing snapshots. No-op/stale saves have no extra effects.

## Verification

Test option boundaries, duplicate/DST/elapsed options, exact revisions and answer preservation/invalidation, independent assignment generations, visibility and notification recipient precedence. Seed vote rows where needed until ticket 14 provides the write route. Covers V2-05, V2-08 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
