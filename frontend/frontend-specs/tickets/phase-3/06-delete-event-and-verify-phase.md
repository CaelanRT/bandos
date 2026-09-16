# Delete an event and verify the phase

> **Status:** Ready for implementation
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

## User/system outcome

A leader can remove a future, active, or historical event from everyone's schedule and return to Schedule with truthful feedback.

## Context

This final slice adds the detail-only destructive action, closes unavailable old URLs, and provides the phase-level verification checkpoint after every event journey is functional.

## In scope

- Leader-only Delete on event detail and accessible named confirmation with initially focused Cancel, idle Escape, and trigger-focus restoration.
- Bodyless single request, pending/navigation protection, confirmed list/detail removal, late-read protection, replacement navigation, and persistent dismissible success status.
- Permission/access/session/not-found handling and uncertain reconciliation while retaining dialog context; deliberate retry only when the event remains.
- Complete automated and leader/member browser verification record for Phase 3.

## Out of scope

Delete in Edit, typed-name confirmation, restoration/reactivation, bulk deletion, automatic retries, hard-delete promises, or unrelated phase work.

## Routes and access

Delete exists only on `/bands/:bandId/events/:eventId` for a confirmed leader, before or after start. Confirmed/unavailable deletion replacement-opens `/bands/:bandId`. Members and unknown roles see no action. Old event URLs use the neutral unavailable state.

## API contract

`DELETE /bands/:bandId/events/:eventId` with no body → `200 { message: "Event deleted" }`. Reconcile an uncertain result with detail and list reads. Treat unavailability as current absence, not proof this request deleted it.

## Experience and states

The dialog names the event and explains shared disappearance without implying recovery. Pending cannot dismiss, navigate, or repeat. During uncertain reconciliation the dialog remains; absence navigates with neutral feedback, presence shows a fresh Try delete again action, and failed checking offers Check again. Permission loss suppresses the action and recovers to permitted content.

## Acceptance criteria

- Only leaders can delete, including after start; Delete never appears in Edit.
- Cancel/Escape/focus behavior is accessible and an idle dismissal changes nothing.
- The request is bodyless and single; confirmed success clears every representation before navigation.
- Older list/detail reads and browser Back cannot resurrect the removed event.
- Uncertain deletion never auto-retries or overclaims causality; retry requires a new deliberate click.
- The phase record distinguishes passed automation, performed browser/live checks, and explicit outstanding checks.

## Verification

Test member/leader and future/past controls, dialog name/focus/Escape, pending behavior, exact bodyless request, confirmed cache removal/status/navigation, late reads/Back/deep links, permission/access/expiration, and every uncertain reconciliation branch. Run full Vitest, lint, production build, and `git diff --check`. Perform the specification section 10 keyboard, 320px/desktop, timezone, start-boundary, deep-link/history, separate-account, live create/edit/delete, unavailable, and session-recovery journey; record any unperformed DST case honestly.

## Dependencies

[05 — Edit a future event safely](05-edit-future-event.md). All tickets 01–06 must pass before phase closure.

## Decisions and follow-ups

The final ticket owns verification recording, not unrelated fixes. Any backend ambiguous-DST inconsistency remains separately scoped unless it blocks the documented frontend behavior.
