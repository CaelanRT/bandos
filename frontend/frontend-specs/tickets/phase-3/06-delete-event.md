# Delete an event

> **Status:** Completed — merged in [PR #36](https://github.com/CaelanRT/bandos/pull/36)
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## Objective

Allow a confirmed band leader to delete an event from its detail page and return safely to the band Schedule.

Deletion must require deliberate confirmation, must not automatically retry, and must remove the deleted event from normal application state after confirmed success.

## Source specification

Derived from the Phase 3 requirements for:

* leader-only event deletion;
* deletion from event detail;
* deletion before or after event start;
* event unavailability after deletion;
* existing authentication, permission, and inaccessible-resource handling.

## Context

Event detail, creation, and editing are already available.

This ticket adds the final event-management action.

Deletion should reuse the existing request boundary, access handling, query-cache conventions, status messaging, and navigation patterns rather than introducing new deletion or recovery infrastructure.

## Scope

* Add a leader-only Delete action on event detail.
* Allow deletion whether the event is future, active, or historical.
* Show a confirmation dialog that clearly names the event.
* Allow Cancel and Escape to dismiss the confirmation while no deletion is pending.
* Prevent repeated Delete requests while the mutation is pending.
* Send exactly one bodyless DELETE request per deliberate confirmation.
* On confirmed success:

  * remove or invalidate relevant event data using existing query-cache conventions;
  * replacement-navigate to the band Schedule;
  * show dismissible success feedback.
* Handle recognized permission, authentication, inaccessible-resource, and not-found responses using existing application behavior.
* Ensure deleted or otherwise unavailable event URLs display the existing neutral unavailable state.
* Do not automatically retry a failed deletion.

## Out of scope

* Delete controls inside Edit.
* Typed-name confirmation.
* Event restoration or reactivation.
* Bulk deletion.
* Automatic retry.
* Hard-delete guarantees beyond the API contract.
* Reconciliation systems for uncertain delete outcomes.
* Specialized stale-read race infrastructure.
* Phase-wide browser verification and release sign-off.
* Unrelated Phase 3 fixes.

## Routes and access

Delete exists only on:

`/bands/:bandId/events/:eventId`

for a confirmed leader.

* Confirmed leaders may delete an event before or after it starts.
* Confirmed members do not see Delete.
* Delete is not shown while role information is unresolved.
* Delete does not appear on the Edit route.
* Cancel leaves the user on event detail.
* Confirmed successful deletion replacement-navigates to `/bands/:bandId`.

## API contract

Submit:

`DELETE /bands/:bandId/events/:eventId`

with no request body.

Expected confirmed success:

`200 { message: "Event deleted" }`

Do not automatically retry the mutation.

If deletion does not receive confirmed success, do not claim that the event was deleted.

## Acceptance criteria

* [x] A confirmed leader can see Delete on event detail.
* [x] A confirmed member cannot see or use Delete.
* [x] Delete remains available for events that have already started.
* [x] Delete does not appear on the Edit route.
* [x] Activating Delete opens a confirmation dialog that names the event.
* [x] Cancel or Escape closes an idle confirmation dialog without changing the event.
* [x] Confirming deletion sends exactly one bodyless DELETE request.
* [x] Another delete request cannot be issued while deletion is pending.
* [x] Confirmed successful deletion removes or invalidates the deleted event from relevant application data.
* [x] Confirmed successful deletion replacement-navigates to Schedule.
* [x] Confirmed successful deletion shows dismissible success feedback.
* [x] Permission, authentication, inaccessible-resource, and not-found responses use existing recovery behavior.
* [x] A deleted or unavailable event URL shows the neutral unavailable state.
* [x] Failed deletion does not automatically retry or falsely claim success.

## Testing strategy

### Unit tests

None required unless delete-specific deterministic logic is introduced.

### Integration tests

Cover the primary delete flow:

* confirmed leader sees and can use Delete;
* confirmed member does not;
* confirmation Cancel/Escape leaves the event unchanged;
* confirmed deletion sends one bodyless request;
* duplicate submission is prevented while pending;
* confirmed success returns to Schedule and the deleted event is no longer represented through normal event data;
* representative permission, authentication, and unavailable-event responses use existing recovery behavior.

Do not duplicate exhaustive coverage already provided by shared authentication, navigation, modal, or request-boundary tests.

### Manual / smoke verification

Verify:

* confirmation dialog copy and event name;
* keyboard interaction;
* Cancel and Escape behavior;
* successful deletion from event detail;
* deleted event URL shows unavailable state;
* narrow and desktop layouts.

### Explicitly not required

* uncertain-outcome reconciliation using additional detail/list reads;
* exhaustive stale-read race testing;
* browser Back-history resurrection testing beyond normal application/query behavior;
* typed-name confirmation;
* restoration behavior;
* bulk deletion;
* phase-wide verification in this ticket.

## Implementation notes

* Reuse existing modal/dialog patterns where available.
* Reuse the authenticated request boundary.
* Reuse established role and access handling.
* Reuse TanStack Query cache invalidation/removal conventions.
* Prefer straightforward cache invalidation or removal over custom race-management logic.
* Do not introduce automatic mutation retries.
* Do not promise restoration after deletion.

## Definition of done

* [x] All acceptance criteria are satisfied.
* [x] Required tests pass.
* [x] Existing relevant tests pass.
* [x] Lint passes.
* [x] Build passes.
* [x] Required whitespace/diff checks pass.
* [x] No known regression exists in event detail or deletion behavior.
* [x] No out-of-scope deletion or recovery infrastructure was introduced.

## Dependencies

[05 — Edit a future event safely](05-edit-future-event.md)

## Follow-up work

Phase-wide verification is handled separately from this implementation ticket.
