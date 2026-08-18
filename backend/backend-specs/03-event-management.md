# Event Management Specification

## Goal and scope

Add authenticated event management to the Bandos REST API. A band leader can create, edit, and soft-delete events for an active band they currently lead. Every current member of that band, including its leader, can list and retrieve the band's active events.

An event has a name, an event type, a local calendar date, local start and end times, an IANA timezone, a location, and an optional description. Supported event types are `rehearsal` and `performance`.

This specification deliberately derives event access from current band membership. It does not create per-event attendee records. Selecting participants, invitations, RSVPs, attendance, recurring events, reminders, email, push notifications, in-app notification records, and background notification jobs are deferred to later specifications.

## Domain rules

- Every event belongs to exactly one band and is identified by `event_id`.
- Event names do not need to be unique, even within the same band and schedule.
- A name is trimmed and must contain between 1 and 100 characters.
- `type` is exactly `rehearsal` or `performance`.
- `date` is a real calendar date written as `YYYY-MM-DD`.
- `startTime` and `endTime` are local wall-clock times written as `HH:mm` in the API. Although the UI displays a 12-hour clock with AM/PM, the API uses canonical 24-hour values to avoid ambiguity.
- `timezone` is a valid IANA timezone name such as `America/Toronto`. Timezone abbreviations such as `EST` and arbitrary strings are invalid.
- The date, time, and timezone together define the event's actual start and end instants.
- An event must start strictly later than the current instant. At `19:30:20`, a submitted start of `19:30` is already in the past; `19:31` is valid.
- Events are same-day only. `endTime` must be strictly later than `startTime`; overnight and multi-day events are deferred.
- A location is required, trimmed free-form text between 1 and 255 characters. Structured addresses and meeting links have no special representation in this MVP.
- A description is optional and may contain at most 2,000 characters after trimming. An omitted, `null`, empty, or whitespace-only description is stored and returned as `null`.
- A leader may edit any event field only before the event's currently stored start instant. Once that instant arrives, the event is permanently non-editable, even if a proposed edit would move it into the future.
- An edit must also leave the complete resulting event valid and strictly in the future.
- A leader may soft-delete an event before, during, or after it occurs.
- Event mutation authority comes from the requester's current `user_bands.role`. It does not come from event authorship. A future leadership transfer will therefore transfer event-management authority automatically.
- `created_by_user_id` records authorship for history only and grants no permanent authority.
- Event visibility is derived dynamically from current band membership. A newly added band member immediately sees all active events, and a user who no longer has band membership immediately loses access.
- No `event_members` or participant snapshot table is created in this MVP.
- An inactive user has no authenticated access under the existing authentication rules. Inactive bands and their events are inaccessible through all normal event operations.
- Event deletion is a soft delete that sets `events.is_active` to `false`. Deleted event rows remain stored but are excluded from all normal reads and mutations.
- Event lists are unpaginated and unfiltered for this MVP.

## HTTP contract

All endpoints are nested below `/api/v1/bands/:bandId/events` and require an authenticated session. Successful bodies use `{ "data": ... }`; failures use `{ "error": { "code", "message", "details"? } }`.

| Method | Endpoint | Required access | Behavior |
| --- | --- | --- | --- |
| POST | `/bands/:bandId/events` | Current band leader | Creates an active event for the band. |
| GET | `/bands/:bandId/events` | Current band member | Lists all active events for the band. |
| GET | `/bands/:bandId/events/:eventId` | Current band member | Returns one active event belonging to the band. |
| PATCH | `/bands/:bandId/events/:eventId` | Current band leader | Edits a future active event. |
| DELETE | `/bands/:bandId/events/:eventId` | Current band leader | Soft-deletes an active event. |

HTTP methods express the operation, so resource paths use nouns and do not add action suffixes such as `/getEvents`.

### Create request

`POST /bands/:bandId/events` accepts exactly:

```json
{
  "name": "Tuesday Rehearsal",
  "type": "rehearsal",
  "date": "2026-09-12",
  "startTime": "19:30",
  "endTime": "22:00",
  "timezone": "America/Toronto",
  "location": "Studio B",
  "description": "Bring music stands"
}
```

Every property except `description` is required. `description` may be omitted or `null`. Unknown properties are rejected.

### Update request

`PATCH /bands/:bandId/events/:eventId` accepts any non-empty subset of the event's editable fields:

```json
{
  "location": "Studio C",
  "startTime": "20:00",
  "endTime": "22:30"
}
```

Unknown properties and an empty object are rejected. Submitted fields receive the same normalization and field validation as creation. The controller merges them with the stored event and validates the complete result, including schedule and future-start rules, before updating it. `bandId`, `eventId`, `createdByUserId`, `isActive`, `createdAt`, and `updatedAt` cannot be submitted.

### Parameter validation

`bandId` and `eventId` must each be positive base-10 safe integers with no sign, decimal, exponent, or surrounding characters. Malformed and non-positive identifiers return `400 VALIDATION_ERROR` before any access query.

### Event representation

Controllers map PostgreSQL snake_case columns to camelCase API fields and serialize database `TIME` values consistently as `HH:mm`:

```json
{
  "eventId": 24,
  "bandId": 7,
  "name": "Tuesday Rehearsal",
  "type": "rehearsal",
  "date": "2026-09-12",
  "startTime": "19:30",
  "endTime": "22:00",
  "timezone": "America/Toronto",
  "location": "Studio B",
  "description": null,
  "createdByUserId": 3,
  "isActive": true,
  "createdAt": "2026-08-17T14:00:00.000Z",
  "updatedAt": "2026-08-17T15:00:00.000Z"
}
```

Creator names are not embedded in this MVP; only `createdByUserId` is returned.

`POST` returns `201` with:

```json
{
  "data": {
    "event": {}
  }
}
```

Here and below, the empty object stands for the complete event representation documented above.

Single-event `GET` and successful `PATCH` requests return `200` with the same `{ "data": { "event": ... } }` shape.

`DELETE` returns `200` with:

```json
{
  "data": {
    "message": "Event deleted"
  }
}
```

### Event list

`GET /bands/:bandId/events` returns `200` with complete event representations:

```json
{
  "data": {
    "events": []
  }
}
```

An accessible band with no active events returns an empty array.

Events are divided according to their actual start instants, calculated from `date`, `startTime`, and `timezone` at query time:

1. Future events come first, from soonest to latest.
2. Started and historical events follow, from most recently started to oldest.
3. `eventId` ascending is the final deterministic tie-breaker.

No upcoming/past filter, event-type filter, or pagination is included yet.

## Access control and information hiding

Reuse `authenticate`, `validateBandId`, `loadBandMembership`, and `requireBandLeader`. Authentication runs first. Band access is established once for the nested event router.

For routes containing `:eventId`, add event loading that queries only an active event whose `band_id` equals the already loaded accessible band. On no match it raises `404 EVENT_NOT_FOUND` with `Event not found`.

The existing `BAND_NOT_FOUND` behavior remains authoritative when the band is unknown, inactive, or inaccessible to the requester. Only after band access succeeds can `EVENT_NOT_FOUND` be returned. This produces the following behavior:

- unknown, inactive, or inaccessible band: `404 BAND_NOT_FOUND`;
- malformed `bandId` or `eventId`: `400 VALIDATION_ERROR`;
- accessible band but unknown event: `404 EVENT_NOT_FOUND`;
- accessible band but inactive event: `404 EVENT_NOT_FOUND`;
- accessible band but event belongs to another band: `404 EVENT_NOT_FOUND`;
- ordinary band member attempting a mutation: `403 LEADER_REQUIRED`.

The intended middleware order is:

```text
authenticate
  -> validate bandId
  -> load active band membership
  -> event collection route
       -> require leader for POST
  -> event item route
       -> validate eventId
       -> load active event in loaded band
       -> require leader for PATCH/DELETE
```

Validation may reject a malformed mutation body before or after leader authorization, depending on route composition, but it must never query or mutate an event until authentication and band access have succeeded. Prefer authorization before body validation on leader-only nested routes so ordinary members do not receive detailed mutation-schema feedback.

## Persistence changes

Because the baseline schema is disposable and migrations remain deferred, edit `db/schemas/schema.sql` directly.

Add the enum:

```sql
CREATE TYPE event_type AS ENUM ('rehearsal', 'performance');
```

Add an `events` table equivalent to:

```sql
CREATE TABLE events (
  event_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  band_id INTEGER NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  type event_type NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description VARCHAR(2000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_end_after_start CHECK (end_time > start_time),
  CONSTRAINT fk_events_band FOREIGN KEY (band_id)
    REFERENCES bands(band_id) ON DELETE RESTRICT,
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by_user_id)
    REFERENCES users(user_id) ON DELETE RESTRICT
);
```

The database uses `event_date` to avoid an overly generic column name; the API exposes it as `date`. `TIME` is intentionally without a timezone because the local wall-clock schedule and IANA timezone are stored separately. `TIMESTAMPTZ` is used for audit timestamps.

Application validation remains responsible for trimmed-text lengths, valid IANA names, real local date-times, and future-start rules. The database check independently protects the permanent same-day end-after-start invariant.

Add an index beginning with `band_id` and `is_active` to support accessible event lists and item lookups. Include scheduling columns as appropriate for list ordering. Do not add a uniqueness constraint over event names or schedules.

`updated_at` changes to `NOW()` on every successful edit. Soft deletion need not change `updated_at`; deletion is represented by `is_active` in this schema. A dedicated `deleted_at` can be introduced later if audit requirements demand it.

Recreating the local database from this disposable schema is required before endpoint verification.

## Date, time, and timezone handling

Use one shared event schedule helper so create validation, merged-update validation, response mapping, edit locking, and test setup do not develop different interpretations.

The helper must:

- strictly validate real `YYYY-MM-DD` dates rather than relying on permissive JavaScript date parsing;
- strictly accept request times in `HH:mm` and normalize database `HH:mm:ss` values back to `HH:mm` for responses;
- validate the timezone against runtime-supported IANA zones;
- resolve the submitted local date and time in that zone, not in the API server's local timezone;
- reject a nonexistent local wall-clock time during a daylight-saving transition;
- compare the resolved start instant with the current instant;
- preserve the submitted local calendar fields instead of converting the stored schedule to the server timezone.

If native runtime APIs cannot implement these rules clearly and deterministically, add one focused timezone-aware date library rather than hand-rolling offset calculations. Ambiguous repeated wall-clock times during a daylight-saving fallback must use one documented, consistent library resolution. This edge case does not alter the stored local fields.

SQL ordering and the edit guard should compute the event start instant using PostgreSQL's timezone conversion from `event_date + start_time` and the stored `timezone`. Application and database checks must be covered by transition-focused verification so their interpretations agree.

## Controller behavior

### Create an event

After band membership loading and leader authorization:

1. Normalize and validate the strict request body.
2. Resolve its local start in the supplied timezone and require it to be strictly in the future.
3. Require `endTime > startTime`.
4. Insert one active event using the loaded `bandId` and current session user as `created_by_user_id`.
5. Return the mapped event with `201`.

No membership rows, attendee rows, or notification work are performed. Creation does not need a multi-statement transaction.

### List events

Query active events whose `band_id` equals the loaded accessible band. Apply the upcoming-then-history ordering contract using each row's timezone-aware start instant. Return complete mapped representations. Do not join event creators or band members.

### Get one event

Return the active event loaded within the accessible band as a complete mapped representation.

### Update an event

The start boundary must be enforced atomically rather than relying only on event middleware that may have run moments earlier:

1. Acquire a database client and begin a transaction.
2. Re-select the active event by `event_id` and loaded `band_id` using `FOR UPDATE`.
3. If no row exists, return `404 EVENT_NOT_FOUND`.
4. Resolve the currently stored start instant. If it is less than or equal to the database transaction's current instant, return `409 EVENT_ALREADY_STARTED`.
5. Merge the validated patch fields with the locked row.
6. Validate the complete merged event, including valid local date-time, same-day ordering, and a proposed start strictly in the future.
7. Update every changed field and set `updated_at = NOW()` using the locked event identity.
8. Commit and return the complete updated representation.
9. Roll back on every failure and always release the client.

Locking serializes concurrent edits and makes the stored-start immutability decision authoritative at the update boundary. Use database time within the transaction for the final lifecycle decision. An event that reaches its start while waiting for the lock must not be edited.

### Soft-delete an event

After event loading and leader authorization, set `is_active = false` using a guarded predicate containing `event_id`, loaded `band_id`, and `is_active = true`. Deletion is allowed regardless of start time. If no row is returned because of a concurrent deletion or state change, return `404 EVENT_NOT_FOUND`.

After deletion, the event disappears from lists. Its direct read, edit, and repeated delete all return `404 EVENT_NOT_FOUND`.

## Validation behavior

Use strict Zod objects in `middleware/validate-event.js` and replace `req.body`/validated route parameters with parsed, normalized data, matching existing band validation.

Create validation covers field presence, primitive types, trimming, maximum lengths, enum values, request date/time syntax, timezone validity, description normalization, and unknown properties. Patch validation covers the same submitted-field rules and requires at least one property. Cross-field rules that depend on omitted stored values run after the patch is merged in the controller.

Validation errors return `400 VALIDATION_ERROR` with `Invalid request body`, `Invalid event ID`, or the existing `Invalid band ID` message as applicable. Details use the existing array of `{ "field", "message" }` objects. Schedule failures such as an invalid calendar date, nonexistent local time, end not after start, or proposed start not in the future are validation errors and identify the relevant field or schedule fields.

## Error contract

| Status | Code | Situation |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid identifiers, malformed/unknown/empty body properties, invalid schedule, invalid timezone, or non-future create/proposed schedule. |
| 401 | `AUTHENTICATION_REQUIRED` | No authenticated session. |
| 403 | `LEADER_REQUIRED` | A current ordinary band member attempts event creation, editing, or deletion. |
| 404 | `BAND_NOT_FOUND` | Band is unknown, inactive, or inaccessible to the requester. |
| 404 | `EVENT_NOT_FOUND` | Within an accessible band, event is unknown, inactive, or belongs to another band. |
| 409 | `EVENT_ALREADY_STARTED` | A leader attempts to edit an event whose stored start instant has arrived. |
| 500 | `INTERNAL_ERROR` | Unexpected database or application failure. |

`EVENT_ALREADY_STARTED` uses the message `Events cannot be edited after they have started`. No event operation should expose raw PostgreSQL errors or be mapped to the global `ACCOUNT_CONFLICT` response.

## File-level design

Implement the feature in these locations:

- `db/schemas/schema.sql`: add `event_type`, the `events` table, constraints, and indexes.
- `middleware/validate-event.js`: strict create/patch schemas, `eventId` validation, normalization, and reusable field rules.
- `middleware/event-access.js`: load an active event constrained to the already accessible band.
- `utils/event-schedule.js`: shared strict local-date, local-time, timezone, instant-resolution, and response-time helpers.
- `controllers/event.controller.js`: parameterized event queries, response mapping, creation, reads, transactional update, and soft deletion.
- `routes/event.routes.js`: nested collection and item routes, using `express.Router({ mergeParams: true })` when band parameters are inherited.
- `routes/band.routes.js`: mount the event router beneath `/:bandId/events` after authentication, band ID validation, and band membership loading.
- `package.json` and lockfile: only if a focused timezone-aware date dependency is needed.
- `test-scripts/event-smoke-test.sh`: end-to-end event and authorization verification.
- `test-scripts/teardown-event-smoke-test.sh`: guarded deletion of smoke-test events, memberships, bands, sessions, and users in foreign-key-safe order.

Keep the existing route-to-controller-to-database architecture. Do not introduce an ORM or a new service layer. Reuse the current band middleware rather than duplicating band-access SQL in the event feature.

## Sequential implementation plan

Each slice must be completed and validated before beginning the next. The feature remains usable and inspectable in small increments.

### 1. Add event persistence

- Add the enum, table, foreign keys, check constraint, defaults, and list/lookup index.
- Recreate the disposable local development database.
- Verify PostgreSQL accepts both event types and duplicate schedules.
- Verify it rejects invalid enum values, null required fields, end times not after start times, and orphan band/creator IDs.
- Verify existing authentication and band smoke tests still pass after recreation.

### 2. Add schedule and input validation

- Implement strict create and non-empty patch schemas.
- Implement positive-integer `eventId` validation.
- Implement consistent `HH:mm` mapping and IANA schedule resolution.
- Verify trimming, description-to-null normalization, unknown-property rejection, invalid dates/times/zones, DST transition cases, and exact current-minute behavior without adding routes yet.

### 3. Add nested event access routing

- Add the nested router under the authenticated band router.
- Validate `bandId`, load active band membership, and validate item `eventId` in the documented order.
- Implement active event loading scoped to the loaded band.
- Verify unauthenticated, outsider, inactive-band, malformed-ID, cross-band event ID, deleted-event, member, and leader outcomes independently.

### 4. Implement leader-only creation

- Add `POST /bands/:bandId/events`.
- Insert the band and creator foreign keys from trusted request state rather than the body.
- Verify leader success, member `403`, outsider `404`, non-future rejection, every field rule, duplicate schedules, response casing, `HH:mm` output, and absence of participant/notification side effects.

### 5. Implement member list and item reads

- Add the collection and single-event `GET` operations.
- Implement complete response mapping and timezone-aware ordering.
- Verify an empty array, leader/member equality of access, new-member immediate visibility, upcoming ordering, historical ordering, tie-breaking, and exclusion of soft-deleted events.

### 6. Implement future-event editing

- Add leader-only non-empty partial updates.
- Lock and re-read the event transactionally.
- Merge with stored values and validate the complete result.
- Update `updated_at` and return the refreshed representation.
- Verify every field can change before start, type changes work, description can be cleared, unknown/empty patches fail, member/outsider access is correct, proposed past schedules fail, and transaction rollback preserves the original row.

### 7. Enforce started-event immutability

- Enforce the stored-start boundary using database time while holding the row lock.
- Return `409 EVENT_ALREADY_STARTED` for attempted edits at or after start.
- Verify an event cannot be moved back into the future after starting.
- Exercise the exact boundary and a concurrent lock/wait case to demonstrate that the final database-side decision is authoritative.

### 8. Implement soft deletion

- Add leader-only guarded deletion without a start-time restriction.
- Verify deletion before and after start, member `403`, outsider `404`, list disappearance, direct-read disappearance, and repeated-delete `404`.
- Verify deleting a band continues to hide all of its events without modifying their rows.

### 9. Add the end-to-end smoke test and teardown

Using at least a leader, member, newly added member, and outsider:

1. Create a band, add the member, and create rehearsal and performance events as leader.
2. Confirm an ordinary member cannot create, edit, or delete events.
3. Confirm an outsider receives `BAND_NOT_FOUND` and cannot infer event existence.
4. Confirm both existing band users list and retrieve complete event representations.
5. Add another member after creation and confirm they immediately see existing events.
6. Confirm duplicate names/schedules are allowed and ordering is deterministic.
7. Exercise invalid identifiers, unknown properties, all field bounds, invalid timezone/date/time combinations, same-time/reversed-time schedules, and non-future creation.
8. Patch every editable field as leader and confirm `updatedAt` changes.
9. Confirm a started event returns `EVENT_ALREADY_STARTED` on edit but remains deletable.
10. Soft-delete an event and confirm it disappears and returns `EVENT_NOT_FOUND` thereafter.
11. Soft-delete the band and confirm all remaining events become inaccessible to every member.
12. Confirm unrelated authentication, user, and band behavior still passes its existing smoke coverage.

The smoke script records a safely validated unique run prefix. Teardown deletes `events` before related bands or users, deletes sessions and `user_bands` in foreign-key-safe order, refuses malformed prefixes, and does not touch unrelated development data.

## Completion criteria

The feature is complete when all five endpoints follow the documented success and error contracts; every SQL statement is parameterized; band and event existence are hidden at their respective access boundaries; event visibility follows current band membership without attendee rows; only the current leader can mutate events; creation and proposed edits require a strictly future start; started events are transactionally protected from editing; deletion remains available at any lifecycle stage; inactive bands and events disappear from normal operations; local schedules are interpreted consistently in valid IANA timezones; the database protects permanent relational and same-day invariants; and the event smoke test, teardown, and existing regression smoke tests pass.
