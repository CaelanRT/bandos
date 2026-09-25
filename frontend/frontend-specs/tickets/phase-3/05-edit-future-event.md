# Edit a future event

> **Status:** Completed — merged in PR [#35](https://github.com/CaelanRT/bandos/pull/35)
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## Objective

Allow a confirmed band leader to edit an event that has not yet started and return to the updated event detail page.

The edit flow should reuse the existing event form behavior, validation, access handling, and dirty-navigation protection without introducing additional concurrency or conflict-resolution systems.

## Source specification

Derived from the Phase 3 requirements for:

* leader-only event editing;
* `/bands/:bandId/events/:eventId/edit`;
* future-only edit access;
* event validation;
* partial event updates;
* existing permission, session, and inaccessible-resource handling.

## Context

Event creation and event detail already exist.

Editing should build directly on those capabilities. The form begins with the current event values and submits only supported values that the leader actually changes.

The backend remains authoritative for whether the event is still editable.

## Scope

* Add an Edit action for confirmed leaders on events that have not started.
* Implement `/bands/:bandId/events/:eventId/edit`.
* Populate the form using the current event values.
* Reuse the same supported fields and validation rules as event creation.
* Track whether the form differs from its original values.
* Disable Save when nothing has changed.
* Submit only changed editable fields.
* Prevent multiple submissions while Save is pending.
* Reuse the existing unsaved-navigation protection.
* Handle recognized validation, permission, inaccessible-resource, authentication, and lifecycle errors.
* Treat `EVENT_ALREADY_STARTED` as authoritative and prevent further saving.
* On confirmed success:

  * use the returned event as the current event data;
  * clear dirty state;
  * update or invalidate relevant event queries;
  * replacement-navigate to event detail;
  * show the existing success feedback.

## Out of scope

* Editing events after they have started.
* Delete functionality.
* Live merging of refreshed server values into an active form.
* Same-field conflict detection or conflict-resolution UI.
* `Use latest value` actions.
* Revision history.
* ETags, version tokens, or optimistic concurrency control.
* Client timers that automatically close editing at the exact start instant.
* Mutation replay.
* Automatic retries.
* Field-by-field reconciliation after an uncertain network outcome.
* Generalized form or conflict-resolution infrastructure.

## Routes and access

`/bands/:bandId/events/:eventId/edit` requires a confirmed leader and an event that is currently editable.

* Confirmed leaders may edit eligible events.
* Confirmed members do not see Edit.
* Direct member access returns to event detail with permission feedback.
* Started events return to event detail with editing-closed feedback.
* Edit is not shown while role or event state is unresolved.
* Cancel returns to event detail.
* Successful Save replacement-navigates to event detail.

## API contract

Submit:

`PATCH /bands/:bandId/events/:eventId`

with only the normalized editable fields whose values changed.

Do not send:

* IDs;
* creator information;
* active state;
* created or updated timestamps;
* unchanged editable fields.

Expected success:

`200 { event }`

Recognized backend validation errors should be mapped to the relevant form fields where supported.

Do not automatically retry the mutation.

If the backend returns `EVENT_ALREADY_STARTED`, stop the save flow and show editing-closed feedback.

## Acceptance criteria

* [x] A confirmed leader can open Edit for a future event.
* [x] A confirmed member cannot access the edit flow through controls or direct navigation.
* [x] An event already known to have started cannot be edited.
* [x] The edit form is populated from the existing event values.
* [x] The form uses the same applicable validation rules as event creation.
* [x] Save is disabled when no editable values have changed.
* [x] Invalid values cannot be submitted.
* [x] Save sends exactly one PATCH request while the mutation is pending.
* [x] The PATCH body contains only changed normalized editable fields.
* [x] Unsaved changes use the existing shared dirty-navigation behavior.
* [x] Recognized backend field errors appear against the appropriate fields.
* [x] Permission, inaccessible-resource, and authentication failures use the application's existing recovery behavior.
* [x] `EVENT_ALREADY_STARTED` prevents the edit from being saved and returns the user to a safe editing-closed state.
* [x] A confirmed successful response clears dirty state and makes the returned event available to Schedule/detail views.
* [x] Successful Save replacement-navigates to the updated event detail page.
* [x] Failed mutations are not automatically retried.

## Testing strategy

### Unit tests

Cover deterministic logic where it already exists or can be cleanly isolated:

* identifying changed editable fields;
* creating the normalized PATCH body;
* applicable event validation logic.

Do not create additional abstraction solely to make trivial logic unit-testable.

### Integration tests

Cover the primary edit flow:

* confirmed leader can open and save an edit;
* confirmed member cannot use the edit route;
* unchanged and invalid forms do not submit;
* PATCH contains only changed fields;
* duplicate submission is prevented while pending;
* successful Save reaches updated event detail;
* `EVENT_ALREADY_STARTED` is handled safely;
* representative validation, permission, inaccessible-resource, and authentication failures use existing recovery behavior.

Do not duplicate exhaustive coverage already provided by shared form, authentication, navigation, or request-boundary tests.

### Manual / smoke verification

Verify:

* populated form values;
* editing and saving a normal event;
* Cancel with and without unsaved changes;
* keyboard navigation;
* narrow and desktop layout;
* event detail reflects a successful edit.

### Explicitly not required

* live background merging while the form is open;
* concurrent-leader conflict detection;
* same-field conflict UI;
* exact client-side timer transition at event start;
* exhaustive network race simulation;
* exhaustive cache ordering tests;
* field-by-field uncertain-outcome reconciliation;
* ETag/versioning behavior;
* exhaustive validation integration tests where validation logic is already tested elsewhere.

## Implementation notes

* Reuse the event creation fields and validation wherever practical.
* Reuse the existing authenticated request boundary.
* Reuse established role and access handling.
* Reuse the shared unsaved-navigation behavior.
* Follow existing TanStack Query conventions for updating or invalidating event data.
* The backend remains authoritative for lifecycle closure.
* Prefer a straightforward query invalidation/refetch or cache replacement strategy over custom race-management infrastructure.
* Do not introduce generalized concurrency handling for this ticket.

## Definition of done

* [x] All acceptance criteria are satisfied.
* [x] Required tests pass.
* [x] Existing relevant tests pass.
* [x] Lint passes.
* [x] Build passes.
* [x] Required whitespace/diff checks pass.
* [x] No known regression exists in event editing or directly touched shared behavior.
* [x] No out-of-scope concurrency or lifecycle system was introduced.

## Dependencies

[04 — Create a band event](04-create-band-event.md)

## Follow-up work

If real usage later shows concurrent editing is a meaningful problem, add backend versioning or explicit conflict handling as a separate feature.
