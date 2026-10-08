# Phase 9 — Event experience refinement

> **Status:** Specified — tickets and implementation deferred
> **Source:** [Phase 6 user-testing feedback](feedback/phase6-usertestingfeedback.md) and Grill Me decisions, 2026-10-01
> **Prerequisite:** [Phase 8 review](09-phase-8-forms-and-membership-refinement.md)
> **Behavioral baseline:** [Band schedules and events](04-phase-3-band-schedules-and-events.md)
> **Contract assessment:** [Potential backend changes](potential-backend-changes.md)

## 1. Goal and boundaries

Make event rows clearly clickable, simplify event detail controls, and remove manual timezone selection from creation while preserving stored schedule semantics and existing event capabilities. Keep the established design language, permissions, editable-start cutoff, delete confirmation, cache updates, and recovery behavior.

This phase does not introduce event-specific Schedule/Members/Settings tabs, attendees, new event functionality, viewer-timezone conversion, or backend changes. The existing tabs continue to navigate the band workspace.

## 2. Schedule row feedback

The full existing event link responds to hover with a subtle background change spanning its complete row, including time, name, type, location, and padding. Provide equally clear full-row keyboard focus without removing the focus indicator. Keep one semantic link per row and the same destination; do not add a click handler to a noninteractive container or create nested interactive controls.

Apply this to Upcoming and Past rows on band Schedule. Touch navigation must work without hover, and long metadata must wrap without clipping the clickable area. Datebook redesign is outside this increment.

## 3. Event viewing area

Keep the existing band **Schedule / Members / Settings** navigation above the event viewing area, subject to current permissions. Within that area, use this order:

1. Event title, with the event settings cog alongside it when management actions are permitted; retain event-type context.
2. A left-aligned arrow plus **Back** control.
3. Event details and description.

Back always links to `/bands/:bandId`, including entry from Datebook or a direct URL. It is not browser-history navigation. Keep unavailable-event recovery routes clear and functional.

Replace standalone Edit/Delete controls with a compact cog dropdown. Its items are **Edit Event** and **Delete Event**, subject to existing visibility rules: Edit is available only to an authorized leader before the event starts; Delete remains available to an authorized leader regardless of start. Ordinary members see no management cog. Preserve the existing live cutoff behavior rather than presenting a stale Edit action.

Selecting Edit opens the existing edit route. Selecting Delete opens the existing confirmation flow; it never deletes immediately. Preserve pending protection, failure/retry, permission recovery, and the return to Schedule after confirmed deletion. Manage focus as the dropdown hands off to the confirmation dialog and on cancel. Dropdown opening/dismissal and keyboard behavior follow Phase 7's menu conventions.

Format the event detail date as numeric day, full English month, and four-digit year, for example **1 October 2026**. Format the stored calendar date directly; do not let browser timezone conversion shift the day. Retain the machine-readable `YYYY-MM-DD` value in the time element, stored local start/end times, and visible event timezone. Other date presentations remain unchanged.

## 4. Automatic timezone on creation

Remove the timezone label, input, datalist, and selector hint from Create Event. Resolve the browser-configured timezone locally using `Intl.DateTimeFormat().resolvedOptions().timeZone`, check it against the current frontend contract validation, and include it in the existing required `timezone` request field. Keep date and time as local calendar values; do not convert them to UTC, send an offset instead of a zone, or omit the field.

Initialize this timezone once for the creation draft so it stays stable while the form is being filled. The automatically initialized value is the pristine baseline, not an unsaved user edit: merely opening Create Event must not trigger a leave warning. User-entered changes retain existing unsaved protection.

The user explicitly accepted that creation while travelling uses the device's configured timezone, which may differ from the event location. No geolocation, band timezone, or location-based inference is added. Browser `UTC` is valid; silently substituting UTC when detection fails is not.

If detection is missing, unsupported, or throws, retain the draft, block submission, and show an accessible form-level explanation with **Retry timezone detection**. Do not restore a manual selector or focus an absent field. If the server rejects the automatically supplied zone, surface its validation feedback at form level and provide the same recovery action; preserve other field errors and do not silently alter the schedule. Retrying detection must not automatically resubmit or discard user values. These rare failure paths are implementation defaults for the agreed selector-free workflow.

Keep future-start, same-day end-time, real-date, and daylight-saving validation using the derived zone; field-specific schedule errors remain beside the visible date/time controls. Server validation remains authoritative.

Edit Event retains its existing timezone control and stored timezone behavior. Do not replace an existing event's timezone with the editor's browser timezone, including when shared form helpers are adjusted. No other creation defaults are added.

This explicitly replaces Phase 3's manual, nondefaulted timezone selection for Create Event only. The API and persistence model are unchanged.

## 5. Acceptance criteria

- Every band Schedule event row has full-row hover and keyboard-focus feedback and retains one working event link.
- Band tabs remain above the event area. Inside it, title/cog precede the left-aligned Back control, then event details.
- Back always returns to the current band's Schedule; detail dates use the agreed full-month format without shifting the stored day.
- Standalone Edit/Delete controls are replaced by the cog menu, preserving leader-only access, edit cutoff, delete confirmation, recovery, and pending protection.
- Create Event has no timezone selector or selection hint and sends a supported browser-derived zone with the existing local date/time payload.
- Opening creation without user edits is pristine; a derived timezone does not cause a false unsaved-change warning.
- Failed timezone detection or server timezone rejection preserves the draft, shows accessible recovery, and neither silently substitutes a timezone nor sends an invalid request.
- Existing schedule/DST validation remains effective; Edit preserves existing timezone controls and never overwrites a stored zone from the browser implicitly.
- Backend endpoints, payload schema, storage, permissions, cache ownership, and event lifecycle rules are unchanged.

## 6. Required test audit and review

Before implementation, identify tests that enter/select timezone manually or expect Create Event timezone controls. Review `createEvent.test.jsx`, `eventForm.test.js`, `eventBoundary.test.js`, `editEvent.test.jsx`, `eventDetail.test.jsx`, and `bandSchedule.test.jsx`, plus affected navigation tests. Update creation expectations without removing Edit or schedule-validation coverage.

Cover a known browser timezone in the submitted payload, valid UTC, failed detection/retry, server rejection of the hidden field, initial pristine state versus an edited draft, DST validation, stored-date formatting across browser zones, Back from Datebook/direct entry, permitted cog actions, and delete confirmation. Prefer existing tests where they already prove the preserved behavior; avoid duplicating every mutation scenario.

Browser-review all three phases together at desktop, 320px, and 200% zoom, including keyboard menus, touch-sized controls, reduced motion, and representative failure states. Run relevant tests, lint, build, and whitespace checks. The final review must account for every feedback item; acceptance remains frontend-only.
