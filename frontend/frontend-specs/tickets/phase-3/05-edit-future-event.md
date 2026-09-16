# Edit a future event safely

> **Status:** Ready for implementation
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## User/system outcome

A leader can change a future event without silently losing their draft, overwriting unseen changes, or editing after the lifecycle closes.

## Context

Reuse creation fields and validation, but treat fetched values, partial patches, concurrent leader changes, and the server's atomic start boundary as distinct edit concerns.

## In scope

- Future-only leader Edit action and `/bands/:bandId/events/:eventId/edit` route.
- Populated form, normalized dirty baseline, changed-field-only non-empty patch, dirty/pending protection, and confirmed cache replacement/navigation/status.
- Background merging for untouched fields; same-field conflict identification, preserved local values, and `Use latest value` actions.
- Client start timer and authoritative `EVENT_ALREADY_STARTED`; permission/access/unavailable/session recovery; differing-field uncertain-outcome comparison and deliberate retry.

## Out of scope

Delete controls, editing started events, revision history, ETags/version locking, auto-merge of same-field conflicts, mutation replay, or event restoration.

## Routes and access

Only a confirmed leader with a client-resolved future event receives Edit. Members return to detail with feedback; started events return to detail with editing-closed feedback. Unknown role/lifecycle exposes nothing. Cancel returns to detail.

## API contract

`PATCH /bands/:bandId/events/:eventId` sends exactly the non-empty subset of normalized editable fields → `200 { event }`. Never send IDs, creator, active state, or timestamps. Handle lifecycle, permission, validation, missing/access, expiration, and uncertain failures per the specification.

## Experience and states

Unchanged Save is disabled. Untouched fields absorb background changes with an announcement. Same-field changes preserve the local draft, identify conflicts, and let the user accept latest values; saving otherwise deliberately overwrites those fields. Crossing the start boundary or receiving its server error disables saving but retains the draft for review. Permission loss discards inaccessible work without a dirty prompt.

## Acceptance criteria

- Members, unknown roles, and started events cannot issue patches through controls or direct routes.
- Save sends one exact changed-field patch and cannot submit unchanged, invalid, pending, or closed input.
- Remote refresh never silently replaces a local edit; conflict choices update values/baseline predictably.
- Confirmed edits replace list/detail caches and cannot be reverted by older reads.
- Start-boundary closure preserves reviewable input and never replays or moves the event.
- Uncertain reconciliation claims only that current values match, or shows only differing fields while retaining the draft.

## Verification

Integration tests cover route/control gating, populated/unchanged forms, exact partial bodies, validation, dirty/pending behavior, background untouched merges, same-field conflicts and Use latest, client/server start boundaries, permission/access/expiration, cache races/status, and uncertain matching/differing/recheck/retry states. Manually verify conflict and timer transitions, keyboard use, history, unload, and narrow layout. Run lint, tests, build, and whitespace checks.

## Dependencies

[04 — Create a band event](04-create-band-event.md).

## Decisions and follow-ups

Without a backend version token, overwrite after a visible conflict is deliberate rather than concurrency-safe. Record a versioning need only if real use demonstrates it.
