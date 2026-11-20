# BE-V2-09 — Manage member eligibility and repairable default lineups

> **Status:** For Review — [Draft PR #89](https://github.com/CaelanRT/bandos/pull/89)
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

## Implementation and verification

- Member addition requires an existing active verified account and at least one
  band-owned eligible instrument. Leader-only eligibility edits allow clearing,
  including the leader's own list; duplicate memberships use `MEMBER_ALREADY_EXISTS`.
- Complete optional defaults use unique musicians and current template slots.
  Reads retain repairable mappings and compute `MISSING_SLOT`, `MEMBER_UNAVAILABLE`
  and `INSTRUMENT_INELIGIBLE`; removed template slots drop out.
- Band mutations use current ownership checks, ordered account/band locks,
  expected versions, semantic no-ops and idempotent replay. Defaults and eligibility
  edits issue no invitations/mail and preserve existing event snapshots/history.
- `TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55449/postgres
  node --test $(rg --files test -g '*.test.js' | rg -v 'readiness-shutdown|runtime-security')`:
  **98 passed**, including eight new member/default scenarios. Focused band/member
  suites: **21 passed**. Covers account state rechecks while waiting for locks,
  competing writes, authorization/replay, template invalidation/repair, clearing
  eligibility/defaults, foreign IDs, repeated slots and snapshot preservation.
- `node --test test/runtime-security.integration.test.js`: **3 passed** with
  disposable PostgreSQL TLS fixtures and fake mail. Changed JavaScript syntax
  checks and `git diff --check` passed. No npm test/lint/build/typecheck scripts
  are defined. Readiness/shutdown behavior is unchanged.
- Existing band/event smoke scripts were attempted on isolated API processes with
  fake email delivery. They stop at pre-existing setup limitations: unverified
  band creator and event username exceeding 50 characters. The new HTTP tests
  exercise verified-account behavior for this slice.
- Applying defaults is local frontend behavior. New/moved event assignment
  eligibility validation belongs to BE-V2-10; removal transitions belong to
  BE-V2-16. These downstream behaviors are not claimed complete here.
- Independent `review-ticket` review: **PASS** on all five criteria, with no
  blocking or non-blocking findings. Reviewer independently reran the focused
  suites (**21 passed**) and `git diff --check`.
- Current API details: [band configuration runtime](../../../db/band-configuration.md).
