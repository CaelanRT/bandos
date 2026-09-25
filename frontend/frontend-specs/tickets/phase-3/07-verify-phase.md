# Verify Phase 3

> **Status:** Completed — see [Phase 3 verification result](07-verification-result.md)
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## Objective

Verify that the completed Phase 3 event workflows function together as intended for confirmed leaders and members, and record any remaining issues without expanding the phase scope.

This ticket is for verification and phase closure only.

## Source specification

Derived from the complete Phase 3 specification and completed implementation tickets for:

* browsing the band schedule;
* viewing event detail;
* creating an event;
* editing a future event;
* deleting an event.

## Context

All Phase 3 implementation tickets should be complete before this ticket begins.

The purpose of this ticket is to verify that the implemented workflows operate correctly together and that the repository is in a shippable state for this phase.

This ticket must not introduce new features, new acceptance criteria, speculative edge-case handling, or unrelated refactors.

## Scope

* Run the relevant automated test suites for Phase 3.
* Run required repository validation commands.
* Perform focused browser smoke verification of the completed event workflows.
* Verify both leader and member behavior where their permissions differ.
* Verify representative authentication, access, and unavailable-resource behavior already implemented by the phase.
* Record any failed checks or known issues discovered during verification.
* Distinguish genuine Phase 3 regressions from unrelated pre-existing issues.
* Produce a concise phase verification record.

## Out of scope

* New Phase 3 features.
* Additional edge-case coverage not required by the approved specification.
* New automated tests solely to increase coverage.
* Refactoring working implementation.
* General cleanup unrelated to a discovered blocking defect.
* Performance optimization.
* Accessibility redesign beyond confirming the implemented interactions remain usable.
* Backend changes unless an existing backend defect directly prevents required Phase 3 behavior.
* Phase 4 or later functionality.

## Preconditions

Before verification begins:

* all Phase 3 implementation tickets are complete;
* required ticket-level reviews have passed or been explicitly accepted;
* no known implementation ticket remains intentionally incomplete.

If a Phase 3 implementation ticket is still incomplete, report that as a phase blocker rather than silently completing its scope here.

## Acceptance criteria

* [x] Relevant Phase 3 automated tests pass.
* [x] Required repository lint checks pass.
* [x] Required repository build checks pass.
* [x] Required typecheck or equivalent static checks pass, if applicable.
* [x] Required whitespace/diff checks pass.
* [x] A confirmed member can browse Schedule and open supported event detail without seeing leader-only management actions.
* [x] A confirmed leader can browse Schedule and open event detail.
* [x] A confirmed leader can create an event and reach its detail page.
* [x] A confirmed leader can edit an eligible future event and see the updated result.
* [x] A confirmed leader can delete an event and return to Schedule.
* [x] Member and leader permission boundaries behave consistently across direct navigation and visible controls.
* [x] Representative session-expiration and inaccessible-resource behavior use the existing application recovery flow.
* [x] Unsupported Phase 3 capabilities are not exposed through placeholder or disabled controls.
* [x] No blocking regression is observed in the completed Phase 3 workflows.
* [x] Any remaining non-blocking issue is recorded separately rather than silently expanding this ticket.

## Verification strategy

### Automated verification

Run the existing relevant automated suites.

Prefer existing ticket and shared tests over adding new phase-level duplication.

Verify at minimum the tests covering:

* Schedule;
* event detail;
* event creation;
* event editing;
* event deletion;
* shared access/authentication behavior touched by Phase 3.

Do not create exhaustive new cross-feature test matrices solely for this verification ticket.

### Repository checks

Run the repository-standard commands for:

* tests;
* lint;
* build;
* typecheck, if applicable;
* whitespace/diff validation.

Record the exact commands and outcomes.

### Browser smoke verification

Use representative leader and member sessions.

#### Member

Verify:

* Schedule loads.
* Upcoming/Past event navigation works.
* Event detail opens from Schedule.
* Create, Edit, and Delete controls are not available.
* Direct access to leader-only routes recovers using the intended permission behavior.

#### Leader

Verify:

* Schedule loads.
* Event detail opens.
* Create event completes successfully.
* Created event appears through normal Schedule/detail behavior.
* Future event Edit completes successfully.
* Updated event appears correctly.
* Delete completes successfully.
* Deleted event no longer appears through the normal Schedule flow.
* Opening the deleted event URL shows the expected unavailable state.

### Representative recovery checks

Verify representative examples of:

* expired authentication;
* inaccessible band or event;
* backend validation feedback.

Do not exhaustively reproduce every error case already covered by lower-level automated tests.

## Explicitly not required

* Exhaustive browser testing of every validation rule.
* Exhaustive timezone combinations.
* Exhaustive race-condition testing.
* Exact timer-boundary testing.
* Concurrent multi-user editing simulations.
* Network-failure permutation testing.
* New tests solely to increase numerical coverage.
* Visual polish owned by a later phase.
* Fixing unrelated technical debt.

## Handling discovered issues

Classify discovered issues as either:

### Blocking

An issue blocks Phase 3 closure only when it:

* violates the approved Phase 3 specification;
* breaks a completed core user workflow;
* violates the intended member/leader access boundary;
* causes a required automated or repository check to fail because of Phase 3 changes;
* creates a concrete security, data-loss, or corruption problem.

A blocking issue should be fixed in the smallest appropriate implementation ticket or follow-up fix.

Do not broaden this verification ticket to redesign the feature.

### Non-blocking

Examples include:

* cosmetic issues;
* additional desirable test coverage;
* speculative edge cases;
* refactoring opportunities;
* future hardening;
* minor UX improvements outside the approved Phase 3 requirements.

Record these separately.

They do not prevent Phase 3 closure.

## Required verification record

Produce a concise record using this structure:

# Phase 3 Verification Result

PASS | FAIL

## Automated checks

* `<command>` — PASS/FAIL
* `<command>` — PASS/FAIL

## Member smoke verification

* [PASS/FAIL] Schedule
* [PASS/FAIL] Event detail
* [PASS/FAIL] Management controls hidden
* [PASS/FAIL] Direct-route permission handling

## Leader smoke verification

* [PASS/FAIL] Schedule
* [PASS/FAIL] Event detail
* [PASS/FAIL] Create
* [PASS/FAIL] Edit
* [PASS/FAIL] Delete

## Recovery checks

* [PASS/FAIL] Authentication expiration
* [PASS/FAIL] Inaccessible resource
* [PASS/FAIL] Representative validation handling

## Blocking issues

None.

Or list each blocking issue with concise evidence.

## Non-blocking observations

None.

Or list concise follow-up observations.

## Outstanding manual checks

None.

Or explicitly list any check that could not be performed.

## Definition of done

* [x] All required automated and repository checks have been executed.
* [x] Required member and leader smoke workflows have been performed.
* [x] Verification results have been recorded.
* [x] No unresolved blocking Phase 3 issue remains.
* [x] Non-blocking observations have been separated from required Phase 3 work.
* [x] No unrelated implementation scope was added during verification.

## Dependencies

All Phase 3 implementation tickets must be complete before this ticket is closed.
