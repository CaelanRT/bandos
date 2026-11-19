# BE-V2-01 — Establish v2 relational storage and integrity

> **Status:** For Review
> **Draft PR:** https://github.com/CaelanRT/bandos/pull/70
> **Dependencies:** None.
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 2–3
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–10

## Outcome

A fresh development database can represent the approved v2 domain with constraints that preserve ownership, assignment identity, history, and delivery effects.

## In scope

- Extend `db/schemas/schema.sql` and existing database setup conventions. Define the required facts in backend section 3 for accounts/sessions, catalogs/eligibility/templates/defaults, events/invitations/history, polls/assignments/options/votes, preferences, tokens, idempotency and outbox records.
- Add aggregate versions, canonical UTC start/end storage and schedule indexes; retain existing identities, soft deletion and historical musician/instrument display facts.
- Enforce case-insensitive email and band instrument uniqueness, one membership per band/user, one active invitation per slot and event/user, unique vote cells and unique poll-to-finalized-event linkage.
- Protect the sole active verified member-owner invariant with database-backed consistency, including membership and owner changes within one transaction. Keep snapshot provenance nullable when template slots are removed.
- Provide isolated fresh-database test setup using existing tooling; no production/dev database deletion, migration or backfill is part of this ticket.

## Acceptance criteria

1. The schema initializes successfully in an isolated PostgreSQL database; existing baseline field limits and valid enum/range constraints remain.
2. Invalid references, duplicate current assignments, duplicate finalization links and invalid owner/membership state cannot be committed. Valid atomic ownership changes can commit.
3. Retiring assignments and removing template slots preserve event/poll snapshots and history. A returning poll musician can receive a distinct assignment generation.
4. Preference defaults enable the master and all six categories. Account tokens store digests; ordinary domain tables contain no raw token/password credentials.
5. Storage supports seven-day idempotency expiry, durable leased dispatch, retry evidence and encrypted temporary security-mail payloads without pruning domain history.

## Verification

Run schema initialization and focused PostgreSQL integrity tests covering ownership consistency, active-assignment uniqueness, snapshot retention and finalization uniqueness. Record the actual setup command; do not reset a shared database.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.

## Implementation verification — 19 November 2026

- Draft PR: [#70](https://github.com/CaelanRT/bandos/pull/70).
- Initialized fresh isolated PostgreSQL 16 and 18 databases; no existing database reset.
- Final command: `TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55439/postgres node --test test/relational-storage.integration.test.js test/runtime-config.test.js test/frontend.integration.test.js` — 19 tests passed.
- `node --check test/relational-storage.integration.test.js` and diff whitespace checks passed.
- Independent `review-ticket` review: PASS on all five criteria; inactive-band owner-membership finding corrected and independently re-reviewed.
- Shared GitHub Project status could not be updated: available GitHub CLI token lacks `read:project`/project access. This repository ticket is For Review; it is not completed.
