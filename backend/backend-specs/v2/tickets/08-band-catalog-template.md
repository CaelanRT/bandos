# BE-V2-08 — Create and configure band catalogs and instrumentation

> **Status:** For Review — [Draft PR #86](https://github.com/CaelanRT/bandos/pull/86)
> **Dependencies:** [01](01-relational-storage.md), [02](02-bounded-sessions.md), [03](03-mutation-concurrency.md), [05](05-registration-verification.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 2–4, 7
> **Contract:** [Shared contract](../00-shared-contract.md), sections 3–4, 10

## Outcome

A verified musician can create a band with ordered repeated/custom instruments, and its current leader can safely maintain the template.

## In scope

- Implement GET `/instruments`, changed POST `/bands`, POST `/bands/:bandId/instruments`, PATCH `/bands/:bandId/instrumentation`, and versioned existing band rename/list/detail behavior.
- Serve the exact twelve starter instruments in shared section 4; atomically create owner membership, band catalog and ordered template, including custom-only creation and optional leaderInstrumentIds.
- Accept starter instrumentId or custom instrumentName per creation slot, never both. Resolve repeated normalized custom names to one band instrument; custom additions are band-wide and case-insensitively unique.
- Return band versions, stable slot/instrument IDs and current member instrumentIds. Preserve existing snapshots rather than cascading template edits into events/polls.

## Acceptance criteria

1. Only active verified users create bands/read the starter catalog; only current owners configure them. Ownership/membership checks and no cross-band IDs apply at commit.
2. Instrumentation contains 1–50 slots including empty/unassigned slots; labels/custom names trim to 1–50 characters, band names retain 1–50. Invalid counts report instrumentation on creation and slots on edits.
3. Repeated instruments are valid; slot positions follow array order. New slots get IDs, omitted slots are removed, and existing slot IDs must belong to the band.
4. A duplicate custom-name request returns the existing instrument without duplicates; normalized no-ops do not bump band version.
5. Creation succeeds atomically or creates nothing. Stale configuration/rename writes return STALE_VERSION; template edits leave event/poll snapshots and invitation histories intact.
6. Band details can represent a null default before ticket 09; no default-apply/send endpoint or catalog administration is added.

## Verification

Test starter/custom-only creation, repeated normalized names/instruments, slot boundaries, cross-band references, owner authorization, atomic rollback, stale/no-op edits and snapshot provenance retention. Covers band portions of V2-01, V2-02 and V2-13.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.

## Implementation and verification

- Starter catalog reads and atomic band creation now support repeated starter or
  custom instruments, ordered slots, and optional leader eligibility. Creation
  uses starter IDs for `instrumentId` and `leaderInstrumentIds`; responses return
  the new band's instrument IDs. Omitted leader eligibility is an empty list.
- Catalog additions, instrumentation replacement and rename use band locks,
  current-owner checks, expected versions, semantic no-ops and idempotent replay.
  Detail/list responses include versions; detail includes catalog, stable slots,
  current member instrument IDs and `defaultLineup: null` until BE-V2-09.
- Snapshot instruments/labels, issued assignments and invitation histories remain
  unchanged by template edits. Deleting a source slot only nulls snapshot provenance.
- `TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55448/postgres
  node --test $(rg --files test -g '*.test.js' | rg -v 'readiness-shutdown|runtime-security')`:
  **89 passed**, including **12** catalog/template tests with commit rollback,
  concurrent configuration, inaccessible creation replay and waiting-write ownership
  transfer coverage.
- `node --test test/runtime-security.integration.test.js`: **3 passed**, using
  a fresh disposable TLS database and fake mail.
- `node --test test/readiness-shutdown.integration.test.js`: **4 passed**, using
  its dedicated disposable PostgreSQL container.
- Changed JavaScript syntax checks and `git diff --check` passed. No backend npm
  test/lint/build/typecheck scripts are defined.
- Legacy band/event smoke scripts were attempted against separate disposable API
  processes with encrypted queued mail and no provider delivery. They stop during
  setup: band creation encounters the verification gate; event registration
  generates a username exceeding its existing 50-character bound. New HTTP
  integration tests verify this ticket's catalog/band behavior with verified users.
- Independent `review-ticket` review: **PASS** on all six criteria, with no
  remaining findings. The initial review found inaccessible creation replay;
  replay now locks the created band and rechecks current membership/access
  before returning stored data. Both deleted-band and removed-creator
  regressions pass; the reviewer independently confirmed the fix.
