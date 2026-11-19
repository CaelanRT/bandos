# BE-V2-09 — Manage member eligibility and repairable default lineups

> **Status:** Not started
> **Dependencies:** [03](03-mutation-concurrency.md), [05](05-registration-verification.md), [08](08-band-catalog-template.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 2–4, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 3–4, 10

## Outcome

Leaders can add eligible existing musicians and save a complete optional default whose applicability reflects current band state.

## In scope

- Implement changed POST `/bands/:bandId/members`, PATCH `/bands/:bandId/members/:userId`, PUT/DELETE `/bands/:bandId/default-lineup` and enhanced band reads.
- Require existing active verified accounts and band-owned instruments; member addition requires at least one eligible instrument, later edits may clear it including the leader's own eligibility.
- Save complete template-slot/user mappings with unique current eligible musicians. Use band.version for writes and defaultLineup.version to identify saved mappings.
- Recompute applicability on reads with MISSING_SLOT, MEMBER_UNAVAILABLE and INSTRUMENT_INELIGIBLE; retain repairable mapping through template/member changes and omit removed template slots.

## Acceptance criteria

1. Only the current leader can add/edit members or defaults; membership conflicts use the shared MEMBER_ALREADY_EXISTS contract. Reject foreign IDs, duplicate musicians/slots and incomplete defaults.
2. Every current template slot is assigned exactly once on default save; clearing the optional default is allowed. No save/apply action issues invitations or email.
3. Adding a template slot makes an old mapping incomplete; removed slots drop out; unavailable/ineligible musicians make it inapplicable until repaired.
4. Eligibility removal preserves unchanged issued event assignments and event snapshots; future new/moved assignments must revalidate eligibility.
5. Successful semantic edits increment band version and update applicability, while stale/no-op writes have no extra effects. Applying the default remains an explicit local frontend action.

## Verification

Test multi-instrument eligibility, rejected unverified/inactive additions, clearing eligibility, repeated instrument slots with unique musicians, complete/incomplete defaults, template/member invalidation and optimistic concurrency. Later lifecycle ticket 16 supplies removal transitions. Covers V2-01, V2-02 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
