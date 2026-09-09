# Create a band and enter its Members workspace

> **Status:** Ready for implementation, subject to dependencies below
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

Any authenticated user can create a band, become its leader, and reach the place where they will add people.

## Context

This slice adds creation access to zero-band home and global navigation, without forcing onboarding.

## In scope

- Dedicated name form at /bands/new, exact validation, pending/field/form errors, and origin-aware Cancel.
- Shared dirty-navigation warning covering Cancel, links, Back/Forward, and best-effort unload protection.
- Confirmed response cache updates and replacement navigation to Members with a consumed-once add-form marker.
- Ambiguous creation reconciliation with duplicate-name caution and deliberate Create again behavior.

## Out of scope

Member-add implementation, automatic name uniqueness checks, band caps, onboarding wizard, and idempotency guarantees absent from the API.

## Routes and access

`/bands/new` requires authentication and is explicitly recognized by routing/destination validation. Creation Cancel uses its separately validated origin or home. Confirmed success goes to `/bands/:bandId/members`.

## API contract

`POST /bands` with exactly `{ name }` (trimmed 1–50 characters) → `201 { band: FullBand }`; refresh `GET /bands` for reconciliation. Handle field validation, authentication, and uncertain network/server/malformed-success failures per specification section 7. Duplicate names are allowed.

## Experience and states

Untouched form has no errors. Pending controls prevent duplicates. Cancel warns only for changed input and returns to origin, not a blind history step. Confirmed success establishes creator Leader and clears dirty state. Uncertain results preserve name and require list checking; matching names never establish success.

## Acceptance criteria

- Both creation entry points work for zero-band and existing-band users.
- Static new route cannot be interpreted as a numeric band route.
- Exact normalized body submits once; no mutation retry occurs.
- Cancel preserves the agreed origin; missing/unsafe origin falls back home.
- Keep editing/Discard and Back navigation work; auth expiration bypasses the guard.
- Successful creation immediately updates list/detail and opens Members; its one-time marker remains usable by ticket 04.
- Ambiguous results cannot auto-navigate to a guessed band; failed reconciliation blocks resubmission until checked.

## Verification

Integration tests cover validation, exact body, duplicates/pending, both entry points, safe origins, history/dirty warnings, success/late-read races, expiration, and uncertain creation with duplicate names and failed recheck. Manually verify keyboard, refresh/unload best-effort behavior, Back/Forward, and narrow form. Run lint, tests, build.

## Dependencies

[02 — Inspect members](02-view-band-members.md), which depends on 01.

## Decisions and follow-ups

Before ticket 04, creation lands on the real member list without a fake add control. Once 04 lands, the marker opens its form once.
