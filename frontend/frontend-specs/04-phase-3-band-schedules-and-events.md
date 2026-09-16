# Phase 3 — Band schedules and events

> **Status:** Ready for ticketing and later implementation
> **Phase outcome:** Band members use upcoming and past schedules, and leaders manage the supported event lifecycle.
> **Planning source:** Approved frontend implementation plan, reconciled with the implemented backend and finalized through a focused Grill Me session on 2026-09-15
> **Governing plan:** [Frontend implementation plan](00-frontend-implementation-plan.md)
> **Backend authority:** [API contract](../../backend/backend-specs/00-api-contract.md), checked against the event routes, validation, access middleware, schedule utility, controller, and schema for this specification.
> **Current frontend baseline:** Phase 2 band workspace, authenticated request boundary, TanStack Query cache conventions, and shared unsaved-navigation behavior.

## 1. Goal and boundaries

Replace the temporary Schedule placeholder with a band-scoped agenda. Current members can see active events and open durable event detail URLs. Leaders can create events, edit events only before they start, and delete events at any point. Date, start time, end time, and timezone remain separate local schedule values from form entry through API submission and display.

This phase builds on the implemented band workspace rather than redesigning it. Keep the existing global band navigation, band context, role source, session-expiration behavior, inaccessible-band recovery, query retry policy, and dirty-form boundary. Final authored styling remains Phase 6.

Phase 3 does not implement:

- the cross-band personal datebook, next-event emphasis, or home aggregation owned by Phase 4;
- attendees, selected participants, RSVPs, invitations, attendance, recurrence, reminders, or notifications;
- event search, filters, user-selectable sorting, pagination, calendar views, or exports;
- overnight or multi-day events;
- event authorship display, because the API returns only `createdByUserId` and not creator display data;
- event restoration or language promising recovery after deletion;
- automatic timezone detection/defaulting, viewer-timezone conversion, polling, or automatic mutation retries;
- final visual-system work or new general form/state/notification frameworks.

Do not show disabled or placeholder controls for unsupported capabilities. The implemented event API is sufficient for this phase; the DST consistency follow-up in section 11 is a backend correctness risk, not permission to expand the frontend ticket scope.

## 2. Routes and access

| Route | Access and behavior |
| --- | --- |
| `/bands/:bandId` | Current member or leader. Replace the placeholder with Upcoming and Past event sections. Leaders see Create event; members do not. |
| `/bands/:bandId/events/new` | Current leader only. Dedicated event creation form. A confirmed member is replacement-redirected to the band Schedule with a contextual permission notice. |
| `/bands/:bandId/events/:eventId` | Current member or leader. Durable full event detail. |
| `/bands/:bandId/events/:eventId/edit` | Current leader only, and only while the event has not started. A confirmed member returns to event detail; an event considered started returns to detail with editing-closed feedback. |

These routes are already recognized as protected authentication destinations. Replace their temporary redirects with real pages while preserving validated deep-link restoration, query strings, hashes, refresh, Back/Forward, and the public catch-all.

Validate `bandId` and `eventId` locally as positive base-10 safe integers with no leading zero, sign, decimal, exponent, or surrounding characters. A malformed band address must not issue a band or event request. A malformed event address shows controlled invalid/unavailable event content with a Schedule link. The API remains authoritative for valid-looking but inaccessible IDs.

Use the full fetched band detail as the role authority for controls and targeted routes. Do not use a band-list summary as the only permission check. While band role or event lifecycle is loading or unknown, show no mutation controls.

## 3. Schedule and event presentation

### Band Schedule

`GET /bands/:bandId/events` returns all active events in one ordered array. The frontend divides that array into:

- **Upcoming:** the event's timezone-aware start instant is strictly later than now, in soonest-first order.
- **Past:** the start instant is equal to or earlier than now, in most-recently-started-first order.

The backend classifies by start, not end. An event that has started but has not ended belongs in Past. Do not classify by local date alone. Preserve the backend order within each group; `eventId` ascending is its deterministic tie-breaker.

Within each section, group events beneath headings for their stored local dates. Use `Today`, `Tomorrow`, and `Yesterday` when that stored date matches the viewer's browser-local calendar date; use a full heading such as `Saturday, September 19, 2026` otherwise. Upcoming date groups are earliest first and Past date groups are newest first. Preserve backend order within each group. Relative labels do not convert an event date or time into the viewer's timezone.

Compact rows are links to event detail and show only:

- local start time, because the date is supplied by the group heading;
- event name;
- rehearsal/performance type;
- location.

The band name is already supplied by workspace context and need not be repeated in every band-schedule row. Compact rows omit timezone, description, end time, creator, audit timestamps, and management buttons. Use human-readable local presentation, including a 12-hour time with AM/PM, without converting the value to the browser's timezone.

Upcoming and Past are both expanded by default and have independent empty states, such as `No upcoming events.` and `No past events.` An empty successful list is not a read failure. A leader uses the single top-level Create event control; empty states do not repeat it. Keep useful cached rows visible during background refresh and place a compact refresh warning and Retry beside the Schedule. An initial failure with no cached events uses a full Schedule error state.

Event responses contain no absolute `startAt`, `hasStarted`, or `canEdit` value. A shared client schedule utility must resolve `date + startTime + timezone` to classify rows and advise whether Edit should appear. Schedule a one-shot reclassification at the next upcoming start boundary while the page remains open, and revalidate on tab focus through the normal event query. Do not poll. Server ordering and lifecycle responses remain authoritative when client time or timezone resolution disagrees.

### Event detail

The detail page starts with the event name and provides an explicit `Back to Schedule` link. It shows the complete user-facing event information:

- event name and rehearsal/performance label;
- separately labeled local Date, Start time, and End time values;
- the stored IANA timezone;
- location;
- description when present.

Omit the Description section when no description is present. Keep Location as plain text; do not invent a mapping-service link. Do not expose internal IDs, `isActive`, or audit timestamps as ordinary content. Do not infer a creator name from currently active members: the creator may no longer be returned in the band member list.

Leaders see Edit only while client schedule resolution says the stored start is in the future. Leaders see Delete before, during, and after an event. Members see neither action. These controls are advisory; every mutation still handles server authorization and lifecycle failures.

## 4. User flows

### Create an event

Create event is available from Schedule only to a confirmed leader. The dedicated form contains visible labels for Name, Type, Date, Start time, End time, Timezone, Location, and optional Description, followed by Create event and Cancel.

Type, date, start time, end time, and timezone begin unselected or blank; the user must choose them explicitly. Use native date/time controls at one-minute precision, while treating shared JavaScript validation as authoritative. Prefer a searchable/selectable list from `Intl.supportedValuesOf('timeZone')`, explicitly add `UTC`, and provide a text-entry fallback when that browser capability is unavailable. Present readable timezone labels while also showing and submitting the canonical IANA identifier. The backend exposes no timezone-list endpoint, and browser support does not prove backend support; show backend timezone validation beside the Timezone field.

Cancel returns to the band's Schedule. Changed input uses the existing Keep editing / Discard changes boundary. On confirmed `201`, cache the returned event, clear dirty state, and replacement-navigate to its detail page with a one-time dismissible creation notice. A late list read must not erase the confirmed event.

### Edit a future event

Open a form populated from the targeted event. Use the same field controls and validation as creation, with Save and Cancel. Cancel returns to event detail. Save is unavailable when the normalized form is unchanged or a request is pending.

Send only changed editable fields in the `PATCH`; never send identifiers, ownership, active state, or audit fields. On confirmed `200`, replace the event in detail and list caches, reset the dirty baseline, and replacement-navigate to detail with a one-time dismissible saved notice.

Client time can suppress an obviously closed Edit action, but it cannot establish the backend transaction boundary. If the start boundary passes while Edit remains open, immediately disable Save, preserve the draft for review, explain that editing has closed, and offer event detail. If `EVENT_ALREADY_STARTED` is returned, apply the same transition, refresh the event, and do not attempt to move it back into the future or replay the patch.

When a background refresh changes only untouched fields, merge those server values into the form and announce that the event changed elsewhere. When a remotely changed field also has a local edit, retain the local draft, identify the conflicted field, and offer `Use latest value`; saving without accepting it deliberately overwrites that field.

### Delete an event

Delete is available from event detail only, not from the Edit form. It opens an accessible confirmation dialog naming the event and explaining that it will disappear from the band's schedule for everyone. Provide Cancel and Delete event. Cancel is initially focused; Escape cancels while idle and focus returns to the trigger. Do not require typed-name confirmation or describe soft deletion as reversible.

Confirmed deletion removes the event from the list and detail caches, clears dirty event state, and replacement-navigates to the band Schedule with a one-time `Event deleted.` notice. Pending deletion prevents duplicate requests and navigation races. Deletion is available to leaders even after the event starts. Creation, save, and deletion notices are dismissible status messages that remain until dismissed or the next navigation; they do not auto-expire.

## 5. Component and state responsibilities

- The existing session provider owns identity, authenticated requests, Logout, and session-expiration transitions. Every event call uses `useSession().authenticatedRequest` and passes query/mutation abort signals.
- The band workspace continues to own fetched band identity, membership role, responsive navigation, and the Schedule/Members/Settings links. Phase 3 replaces only Schedule content and activates event routes.
- An event API adapter validates response envelopes after the shared transport unwraps `{ data }`. It rejects malformed models, duplicate list IDs, wrong `bandId`/`eventId`, and unexpected success payloads as controlled client errors.
- Event query hooks own list/detail retrieval, freshness, cache reconciliation, and removal. Remote events are not copied into durable React context or form state.
- One shared event-schedule utility owns strict date/time syntax, timezone support, local-to-instant resolution, Upcoming/Past classification, display formatting, and lifecycle comparisons. Forms and rows must not develop different time interpretations.
- Create/Edit forms own values, touched/errors, normalized baseline, dirty state, pending state, reconciliation state, remote-change conflicts, and local notices. A background refetch updates untouched fields but must not overwrite locally edited fields.
- The existing unsaved-navigation hook/dialog protects Create and Edit across normal links, global band switching, Cancel, and Back/Forward; `beforeunload` remains best-effort for refresh/tab close.
- Event deletion may reuse the established native-dialog and uncertain-outcome patterns without introducing a generalized modal or toast system.

Keep implementation organized by responsibility, but do not require new abstractions beyond these shared seams.

## 6. Backend API contract and frontend validation

All paths are relative to `/api/v1`. The existing client supplies the configured origin, JSON handling, `{ data }` unwrapping, normalized errors, and `credentials: 'include'`.

| Operation | Request | Success after transport unwrapping |
| --- | --- | --- |
| List | `GET /bands/:bandId/events`, no query | `200 { events: Event[] }` |
| Detail | `GET /bands/:bandId/events/:eventId` | `200 { event: Event }` |
| Create | `POST /bands/:bandId/events`, complete create body | `201 { event: Event }` |
| Edit | `PATCH /bands/:bandId/events/:eventId`, non-empty changed-field subset | `200 { event: Event }` |
| Delete | `DELETE /bands/:bandId/events/:eventId`, no body | `200 { message: "Event deleted" }` |

The event payload is camelCase:

```text
eventId, bandId, name, type, date, startTime, endTime, timezone,
location, description, createdByUserId, isActive, createdAt, updatedAt
```

Validate a successful event as follows:

- `eventId`, `bandId`, and `createdByUserId` are positive safe integers;
- `type` is exactly `rehearsal` or `performance`;
- `date` is a real `YYYY-MM-DD` date;
- `startTime` and `endTime` are exact `HH:mm` strings;
- `timezone` is non-empty and usable by the client schedule utility;
- `name` and `location` are non-empty strings;
- `description` is a string or `null`;
- `isActive` is exactly `true`, because current endpoints expose active events only;
- `createdAt` and `updatedAt` are strings treated as opaque timestamps;
- the returned `bandId` matches the route, and a detail/mutation response also matches the requested/created `eventId` where applicable.

Reject an invalid collection/model instead of silently treating it as an empty schedule or trusting it for lifecycle decisions.

### Form fields

| Field | Client and backend rules | Request normalization |
| --- | --- | --- |
| Name | Required string, 1–100 JavaScript string units after trimming | Trim |
| Type | Required; exactly `rehearsal` or `performance` | Send enum value |
| Date | Required real calendar date, `YYYY-MM-DD` | Preserve local date |
| Start time | Required valid local wall time | Send canonical `HH:mm` |
| End time | Required valid local wall time, strictly later than start on the same date | Send canonical `HH:mm` |
| Timezone | Required; trimmed, max 255; `UTC` or browser/backend-supported IANA-style name containing `/` | Preserve selected name |
| Location | Required string, 1–255 JavaScript string units after trimming | Trim |
| Description | Optional string, max 2,000 after trimming | Trim; send blank as `null` |

The start instant must be strictly later than now on Create and after merging an Edit patch with stored values. The local start and end must exist in the selected timezone; reject nonexistent DST spring-forward times. Overnight events are invalid. For an ambiguous fall-back wall time, the documented application rule chooses the earlier occurrence; section 11 records why the backend response must still win.

Use the established validation timing: no initial errors, validate on blur and then while editing, validate all fields on submit, focus the first invalid field, and map recognized backend `details[].field` beside the matching control. Place unrecognized details and non-field failures in a concise form alert. Keep supporting copy brief; labels, errors, and the explicit timezone requirement should do most of the work.

Event requests are strict. Create sends every field except that `description` may be omitted or `null`. Patch sends a non-empty subset. Unknown keys return `VALIDATION_ERROR`. Duplicate names and schedules are valid and must not be blocked by the frontend.

## 7. Freshness, cache consistency, and uncertain outcomes

Extend the Phase 2 band-scoped private key convention so existing band removal and session clearing continue to remove event data:

```text
['private', 'band', bandId, 'events']
['private', 'band', bandId, 'event', eventId]
```

List and active detail queries are stale immediately and refetch on mount and window focus, matching band resources. Reads use the existing conservative retry rule: at most one retry for transient failures and none for authentication, authorization, validation, not-found, or rate-limit responses. No polling or ordinary Refresh button is added.

On confirmed mutations, cancel or guard older affected reads before applying validated response data. Revalidation failure must not turn a confirmed write into an apparent failed submission.

| Mutation | Confirmed cache behavior |
| --- | --- |
| Create | Add/replace the returned event by ID in the band list, seed its detail, then invalidate the list. |
| Edit | Replace the matching list row and detail with the returned event, then invalidate both without allowing older responses to restore prior values. |
| Delete | Remove the matching list row and detail; invalidate the list without allowing an older response to resurrect the event. |
| Inaccessible band | Phase 2's band-ID predicate removes the event list and all event details along with band context. |

Network, unexpected-server, and malformed-success failures can leave a mutation outcome unknown. Preserve the form/confirmation context, prevent automatic retry, explain that the result could not be confirmed, and perform an explicit read before offering another write:

- **Create:** refresh the event list while remaining on the populated form. Duplicate names and schedules are allowed and there is no idempotency key, so no observed event can prove it was created by this attempt. Show the refreshed schedule in an inline review panel; allow an explicit Create again only with a warning that it could create a duplicate.
- **Edit:** fetch event detail. If every submitted changed field matches the refreshed event, report that the current event matches the draft and reset the baseline without claiming this request applied it. Otherwise preserve the draft and show a field comparison only for values that differ from the refreshed server event before allowing an explicit retry.
- **Delete:** keep the confirmation dialog context while fetching event detail and the list. If the event is unavailable, remove it locally and say it is no longer available without claiming this request deleted it. If it remains available, show a fresh `Try delete again` action; that deliberate click is the required second confirmation.

If reconciliation itself fails, offer Check again and safe navigation with normal dirty warnings. Never replay a mutation automatically.

## 8. Recovery, permissions, and unsaved work

`AUTHENTICATION_REQUIRED` uses the established session-expiration transition: clear all private data and unsaved event values, then restore the recognized event destination after authentication without replaying the failed operation.

`BAND_NOT_FOUND` uses Phase 2 inaccessible-band recovery and removes all band-scoped event keys. Do not reveal whether the band is missing, inactive, or merely inaccessible.

`EVENT_NOT_FOUND` removes the targeted event from list/detail caches and offers the band's Schedule with `This event is no longer available.` A malformed event ID rejected locally uses the same message and recovery link. Do not reveal whether an event is malformed, missing, inactive, deleted, or belongs to another band. A direct detail/edit route must not fall through to generic application Not Found.

`LEADER_REQUIRED` immediately suppresses event-management controls and refreshes the band list and detail together. If the requester is now a member, discard an inaccessible management draft without a dirty-form prompt: Create returns to Schedule and Edit returns to event detail with permission-change feedback. If role refresh fails, keep controls suppressed and offer Retry. If band access disappeared, use `BAND_NOT_FOUND` recovery.

`EVENT_ALREADY_STARTED` is definitive for the failed edit. Retain the draft until the user leaves, close saving, refresh current detail, and offer detail. Deletion remains possible for a leader.

`VALIDATION_ERROR` maps recognized event fields locally; identifier validation and unrecognized details use a resource/form alert. `TOO_MANY_ATTEMPTS`, if ever returned through shared infrastructure, shows the backend message without immediate retry encouragement. Unexpected read failures retain useful stale data and offer contextual Retry.

Create is dirty when any normalized field differs from its initial empty baseline. Edit is dirty when any normalized field differs from the fetched baseline. Opening a form alone is not dirty. Normal navigation uses Keep editing / Discard changes. Session expiration, lost access, `EVENT_NOT_FOUND`, and confirmed create/edit/delete bypass warnings that would trap the user or interrupt the deliberate successful transition. A pending mutation prevents duplicate submission and premature navigation until its result is known.

## 9. Acceptance criteria

- Schedule replaces the placeholder and shows expanded, independently empty Upcoming and Past sections to both roles.
- Classification uses the event's local date, start time, and timezone; started events are Past even before their end time, and a one-shot boundary update prevents an open page from remaining stale indefinitely.
- Each section groups stored event dates beneath browser-calendar relative or full date headings; rows preserve backend order, omit the repeated date and timezone, and open durable event detail URLs.
- Detail shows separately labeled local schedule values, an explicit Schedule link, plain-text location, and only a present Description without browser-timezone conversion or invented creator information.
- Only confirmed leaders see Create/Edit/Delete; members cannot use direct management routes, and server permission changes suppress stale controls.
- Creation begins without type/date/time/timezone defaults, provides native minute-precision schedule controls and readable/canonical timezone entry, validates the complete future same-day schedule, sends the strict body, and opens confirmed detail.
- Editing merges remote changes into untouched fields, preserves and identifies same-field conflicts, sends a non-empty changed-field patch, closes at start, and handles authoritative `EVENT_ALREADY_STARTED` without replay.
- Leaders can delete future or historical events only from detail through an accessible confirmation; success removes all cached representations and opens Schedule with a dismissible, non-expiring status.
- Loading, empty, background failure, malformed response, invalid ID, inaccessible band, unavailable event, expiration, and uncertain mutation outcomes have truthful recovery.
- Dirty Create/Edit input is protected across links, band switching, Cancel, Back/Forward, and best-effort unload without blocking required auth/access recovery.
- No Phase 4 aggregation or unsupported attendee, recurrence, notification, filter, pagination, or restoration behavior appears.

## 10. Verification and ticket sequence

Use existing Vitest/React Testing Library seams with the real router, Query provider, session boundary, band workspace, and mocked HTTP boundary. Prefer observable journeys over snapshots or component internals.

Focused pure tests should cover event-model validation, strict ID parsing, real-date/time validation, same-day end ordering, timezone resolution, spring-forward gaps, fall-back overlap policy, Upcoming/Past classification, start-boundary timers, and 12-hour display without timezone conversion.

Integration tests should cover:

- list loading, independently empty sections, date grouping/relative headings, backend order preservation, detail navigation, cached background failure, and malformed payloads;
- leader/member controls and direct routes while role is loading, after `LEADER_REQUIRED`, and after access disappears;
- Create/Edit defaults, native schedule controls, timezone entry, field validation and backend detail mapping, pending duplicate prevention, dirty navigation, remote-field merges/conflicts, confirmed cache updates, and late-read races;
- `EVENT_ALREADY_STARTED` at the edit boundary and transition back to detail;
- Delete confirmation focus/Escape, deletion before and after start, bodyless request, cache removal, and old URL recovery;
- uncertain Create/Edit/Delete outcomes, inline create review, differing-field edit comparison, retained delete dialog, successful/failed reconciliation, and deliberate retry only;
- session expiration during reads, dirty forms, and pending mutations with protected-destination restoration but no action replay.

Before phase completion, run the complete Vitest suite, lint, production build, and `git diff --check`. Perform keyboard and narrow-width browser checks at 320px and desktop widths. Against the running backend, verify with separate leader/member accounts: create rehearsal and performance events in explicit timezones, view both roles, edit a future event, observe a started event move to Past and close editing, delete future and historical events, refresh/deep-link/history behavior, and inaccessible-resource/session recovery. Record browser/timezone coverage and any DST transition case that could not be exercised.

Implement in this dependency order:

1. **Establish event models and schedule semantics:** API adapters, keys, validation/formatting/resolution utility, and focused unit tests.
2. **Inspect event detail:** targeted query, full local schedule presentation, unavailable-event recovery, and advisory leader actions without exposing unfinished mutations.
3. **Use the band Schedule:** event-list query, date-grouped Upcoming/Past presentation, loading/empty/background-error/access behavior, durable working detail links, and boundary reclassification.
4. **Create a band event:** leader route/control, explicit timezone form, confirmed/uncertain cache behavior, dirty navigation, and tests.
5. **Edit a future event:** lifecycle-gated route/control, remote-field conflict handling, changed-field patch, `EVENT_ALREADY_STARTED` recovery, cache updates, and tests.
6. **Delete a band event:** detail-only confirmation, before/after-start support, confirmed/uncertain removal, route recovery, and phase-level verification.

Each ticket should deliver its full outcome and applicable failure/access states. Do not expose controls for a dependent mutation before its ticket is functional.

## 11. Backend expectations, gaps, and source traceability

### Required backend behavior

The frontend depends on these implemented guarantees:

- event endpoints remain nested under an authenticated, active, currently accessible band;
- item lookup constrains active event by the already authorized band;
- list returns all active events without filters/pagination, ordered future-first then history;
- create and patch use strict field validation and preserve local schedule fields;
- patch atomically refuses a stored event at or after its start with `409 EVENT_ALREADY_STARTED`;
- delete is allowed regardless of start and makes the event disappear from normal reads;
- successes and handled errors retain the documented shapes and codes.

No `hasStarted`, absolute `startAt`, server current time, timezone catalog, or idempotency key is available. Phase 3 therefore resolves schedule instants for presentation, obtains timezone choices locally, and uses read-based uncertain-outcome recovery. A future backend `startAt`/`hasStarted` field would reduce client duplication but is not required to begin the phase.

### Ambiguous DST fall-back risk

The backend JavaScript schedule helper documents and implements the earlier occurrence for an ambiguous repeated wall time. List ordering and the transactional edit guard independently use PostgreSQL `AT TIME ZONE`, which may resolve the same ambiguity using the later standard-time occurrence. This can make list grouping and the precise edit cutoff disagree during the repeated hour.

The frontend should use the documented earlier-occurrence rule conservatively, avoid promising an exact cutoff in ambiguous periods, and always accept the server's returned list and mutation result as authoritative. Backend follow-up should make JavaScript validation and PostgreSQL ordering/locking use one verified disambiguation policy and add transition-specific integration coverage. This is an inference from the two implementations; it is not a claim that ordinary schedules are inconsistent.

### Primary sources

- Product, route, presentation, permission, form, and phase boundaries: [`00-frontend-implementation-plan.md`](00-frontend-implementation-plan.md), especially sections 2–7 and Phase 3.
- Existing frontend integration and cache conventions: [`../src/app/routes.jsx`](../src/app/routes.jsx), [`../src/features/bands/BandViews.jsx`](../src/features/bands/BandViews.jsx), [`../src/features/bands/queries.js`](../src/features/bands/queries.js), [`../src/features/bands/api.js`](../src/features/bands/api.js), and [`03-phase-2-bands-and-membership.md`](03-phase-2-bands-and-membership.md).
- Event endpoints, models, ordering, validation, errors, and frontend guidance: [`../../backend/backend-specs/00-api-contract.md`](../../backend/backend-specs/00-api-contract.md), sections 2.5, 3.5, 4, and 9–13.
- Original event domain and persistence decisions: [`../../backend/backend-specs/03-event-management.md`](../../backend/backend-specs/03-event-management.md).
- Implemented route and authorization order: [`../../backend/routes/band.routes.js`](../../backend/routes/band.routes.js), [`../../backend/routes/event.routes.js`](../../backend/routes/event.routes.js), [`../../backend/middleware/band-access.js`](../../backend/middleware/band-access.js), and [`../../backend/middleware/event-access.js`](../../backend/middleware/event-access.js).
- Implemented shapes, list ordering, lifecycle checks, and mutation behavior: [`../../backend/controllers/event.controller.js`](../../backend/controllers/event.controller.js) and [`../../backend/middleware/validate-event.js`](../../backend/middleware/validate-event.js).
- Local-time and timezone resolution: [`../../backend/utils/event-schedule.js`](../../backend/utils/event-schedule.js).
- Persistence constraints: [`../../backend/db/schemas/schema.sql`](../../backend/db/schemas/schema.sql).

## 12. Decisions and deferred work

This plan resolves Phase 3 implementation defaults as follows: Schedule uses expanded, date-grouped Upcoming and Past sections with browser-calendar relative headings; rows omit their repeated date, end time, and timezone. Create opens the confirmed event detail; Edit saves back to detail; Delete is detail-only and opens Schedule. Past means started rather than ended; forms begin without schedule/type defaults and send canonical `HH:mm` while user-facing time is 12-hour. Timezone has no silent default and uses readable labels alongside canonical identifiers. Detail uses labeled schedule values, plain-text location, no empty Description section, and an explicit Schedule link. Background edit refreshes merge untouched fields and surface same-field conflicts. Success notices remain until dismissed or navigation. List/detail queries refetch on focus without polling, and identical names/schedules never prove an uncertain creation succeeded.

Phase 4 owns personal home/datebook aggregation and band-name labels in cross-band rows. Phase 5 owns Account and final global resilience review. Phase 6 owns authored visual styling. Attendees, RSVP, recurrence, reminders, notifications, filtering, pagination, overnight events, and backend-supplied lifecycle/timezone metadata remain deferred until supported authoritatively.
