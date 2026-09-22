# Create a band event

> **Status:** Ready for implementation
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## Objective

Allow a confirmed band leader to create a rehearsal or performance from the band workspace and, after confirmed creation, arrive at the event's durable detail page.

Creation must preserve the event's local date, time, and timezone semantics and must not automatically retry an uncertain mutation.

## Source specification

Derived from the Phase 3 requirements for:

* leader-only event creation;
* `/bands/:bandId/events/new`;
* event schedule validation and timezone handling;
* shared dirty-navigation behavior;
* event creation API behavior;
* existing permission, access, and session recovery behavior.

## Context

Schedule browsing and event detail are already available.

This ticket adds the first event-management action. The form should reuse the existing band workspace, authenticated request boundary, validation conventions, query-cache conventions, and unsaved-navigation behavior rather than introducing new general frameworks.

## Scope

* Add one leader-only Create event control.
* Implement `/bands/:bandId/events/new`.
* Provide labeled fields for the supported event values.
* Require deliberate entry or selection of type, date, time, and timezone rather than supplying automatic schedule defaults.
* Use minute-precision date/time controls.
* Provide an accessible searchable timezone control using readable labels while submitting canonical timezone identifiers.
* Normalize the request body according to the event API contract.
* Reuse the shared dirty-navigation behavior.
* Prevent duplicate submission while a creation request is pending.
* On confirmed success:

  * treat the returned event as authoritative;
  * update or invalidate relevant event queries using existing TanStack Query conventions;
  * clear dirty state;
  * replacement-navigate to the durable event detail route;
  * show the existing success feedback.
* Handle recognized validation, permission, inaccessible-band, and authentication failures using existing application behavior.
* Handle an uncertain creation outcome honestly without automatically retrying or claiming success.

## Out of scope

* Editing events.
* Deleting events.
* Duplicate detection.
* Idempotency.
* Automatic timezone selection or detection.
* Manual timezone-entry fallback beyond the supported timezone control.
* Overnight or multi-day events.
* Recurrence.
* Attendees, RSVPs, invitations, or attendance.
* Automatic mutation retries.
* Inline Schedule reconciliation after an uncertain creation outcome.
* Custom stale-read or race-management infrastructure.
* General-purpose form, toast, or notification frameworks.
* Broader query/cache refactoring unrelated to event creation.

## Routes and access

`/bands/:bandId/events/new` is available only to a confirmed leader based on full band detail.

* Confirmed leaders may access the route and see the Create event control.
* Confirmed members do not see the control and are replacement-returned to Schedule with contextual permission feedback if they access the route directly.
* Until leader access is confirmed, creation controls are not exposed.
* If leader permission is lost while the form is open, use the application's existing access-recovery behavior.
* Cancel returns to Schedule.
* Confirmed creation replacement-opens the created event's detail route.

## API contract

Submit:

`POST /bands/:bandId/events`

with the complete normalized body required by the Phase 3/API specification.

Expected confirmed success:

`201 { event }`

Description may be omitted or `null`; blank input normalizes to `null`.

Recognized backend validation details should be mapped to the appropriate form fields where supported.

The mutation must not be automatically retried.

## Acceptance criteria

* [ ] A confirmed leader can open the Create event form from the band workspace.
* [ ] A confirmed member cannot use the creation flow, and direct route access returns them safely to Schedule with permission feedback.
* [ ] Creation controls are not shown while the user's role is unresolved.
* [ ] The form initially shows no validation errors.
* [ ] Required schedule values are deliberately entered or selected rather than automatically defaulted.
* [ ] The form uses the Phase 3 event-validation rules before submission.
* [ ] Invalid values cannot be submitted.
* [ ] Recognized backend field-validation errors are shown against the relevant fields.
* [ ] The submitted request body matches the required normalized API shape.
* [ ] Only one creation request can be in flight from a single submission attempt.
* [ ] Dirty navigation uses the existing shared unsaved-navigation boundary.
* [ ] A confirmed `201 { event }` clears dirty state.
* [ ] A confirmed creation updates or invalidates the relevant event queries using existing TanStack Query conventions.
* [ ] A confirmed creation replacement-navigates to the returned event's durable detail page.
* [ ] Permission loss, inaccessible-band responses, and authentication expiration use the application's existing recovery behavior.
* [ ] If creation does not receive a confirmed outcome, the form retains the user's values and does not claim success or failure.
* [ ] An uncertain creation outcome is not automatically retried.
* [ ] A deliberate retry after an uncertain outcome warns that the original request may already have succeeded and that a duplicate event could result.

## Testing strategy

### Unit tests

Cover deterministic logic where it already exists or can be cleanly isolated:

* request normalization;
* applicable event-validation rules;
* timezone identifier/value normalization;
* mapping recognized backend validation details to form fields.

Do not introduce unnecessary abstractions solely to make trivial behavior unit-testable.

### Integration tests

Cover the primary creation flow:

* confirmed leader can access and submit the form;
* confirmed member/direct route access is rejected safely;
* invalid input prevents submission;
* the normalized request body is submitted once;
* duplicate submission is prevented while pending;
* successful creation clears dirty state and reaches the correct event detail route;
* shared dirty-navigation behavior is connected to the form;
* representative permission, inaccessible-band, and authentication failures use the existing recovery behavior;
* an uncertain mutation outcome preserves the draft, does not automatically retry, and supports a deliberate warned retry.

Representative integration coverage is sufficient for shared permission, authentication, navigation, and request-boundary behavior. Do not duplicate exhaustive coverage owned by those shared systems.

### Manual / smoke verification

Verify:

* native date/time control usability;
* timezone search, keyboard behavior, and readable labels;
* Cancel with and without unsaved changes;
* successful creation from Schedule through event detail;
* narrow and desktop layouts;
* representative timezone values.

### Manual smoke checks for draft review

These checks are intentionally non-blocking for creating the Draft Pull Request. They could not be performed in the implementation environment because no supported browser runtime is installed. Complete and record them during human review before marking the PR ready:

* [ ] Native date/time control usability.
* [ ] Timezone search, keyboard behavior, and readable labels.
* [ ] Cancel with and without unsaved changes.
* [ ] Successful Schedule-to-detail creation flow.
* [ ] Narrow and desktop layouts.
* [ ] Representative timezone values.

### Explicitly not required

* exhaustive integration coverage for every validation rule;
* exhaustive timezone catalog/search permutations;
* manual timezone fallback behavior not required by the supported control;
* inline Schedule reconciliation after an uncertain outcome;
* full browser lifecycle simulation;
* exhaustive browser history or unload testing;
* duplicate-detection testing;
* stale-read race testing beyond normal application query behavior;
* custom mutation-reconciliation infrastructure;
* unsupported recurrence, attendees, multi-day events, or automatic timezone selection;
* new generalized form or notification infrastructure.

## Implementation notes

* Reuse the existing authenticated request boundary.
* Reuse established band-role and access behavior.
* Reuse the shared unsaved-navigation behavior.
* Reuse existing event validation and form conventions where practical.
* Follow established TanStack Query cache conventions.
* Browser timezone options are guidance for valid identifiers; backend validation remains authoritative.
* Do not introduce automatic mutation retries.
* Prefer straightforward query invalidation or cache updates over custom race-management logic.
* Do not add reconciliation behavior beyond retaining the form and reporting an uncertain result honestly.

## Definition of done

* [ ] All acceptance criteria are satisfied.
* [ ] Required tests from the Testing Strategy are implemented and passing.
* [ ] Existing relevant tests pass.
* [ ] Lint passes.
* [ ] Build passes.
* [ ] Required whitespace/diff checks pass.
* [ ] No known regression exists within event creation or directly touched shared behavior.
* [ ] No out-of-scope recovery, cache-race, or form infrastructure was introduced.

## Dependencies

[03 — Browse a band schedule by date](03-browse-band-schedule-by-date.md)

## Follow-up work

If real usage later demonstrates a need for stronger uncertain-mutation reconciliation, duplicate prevention, or idempotent event creation, handle that as separate follow-up work.
