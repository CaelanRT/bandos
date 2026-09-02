# Bandos Backend API Contract

> **Status:** Master frontend integration reference for the backend implementation currently in this repository.  
> **API base path:** `/api/v1`  
> **Last verified:** 2026-08-30  
> **Authority:** Runtime source code. Where an older feature specification disagrees with the implementation, this document describes the implementation and calls out the difference.

## 1. Purpose and source of truth

This document gives frontend developers and coding agents one place to understand every currently mounted HTTP endpoint, its access rules, inputs, response data, errors, and important lifecycle behavior. It describes the code that actually runs, not planned routes.

The runtime entry point is [`app.js`](../app.js), which mounts the routers listed below. Request and response details come from the corresponding route, middleware, controller, scheduling utility, and database-schema files. Earlier design context remains in [`01-backend-scaffold.md`](01-backend-scaffold.md), [`02-band-management.md`](02-band-management.md), and [`03-event-management.md`](03-event-management.md).

## 2. Frontend integration essentials

### 2.1 Transport and URL

- Prefix every endpoint in this contract with the backend origin and `/api/v1`.
- Send JSON request bodies with `Content-Type: application/json`.
- In production, plain HTTP receives `426 HTTPS_REQUIRED`; HTTPS is required.
- The API enables CORS for exactly the origin configured by `CLIENT_ORIGIN` and allows credentials.
- There is no pagination on any current collection endpoint.

Source: [`app.js`](../app.js), lines 17–39 and 59–64.

### 2.2 Cookie session authentication

Authentication uses a server-side PostgreSQL session and an opaque cookie named `bandos.sid`. Registration and login create an authenticated session. Logout and account deactivation destroy it.

Browser requests that need authentication must include credentials. For `fetch`:

```js
await fetch(`${API_ORIGIN}/api/v1/bands`, {
  credentials: 'include',
});
```

Cookie properties are:

| Property | Value |
| --- | --- |
| Name | `bandos.sid` |
| HttpOnly | `true`; frontend JavaScript cannot read it |
| SameSite | `lax` |
| Secure | `true` only in production |
| Lifetime | Rolling 7 days |

There is no bearer token or token refresh endpoint. The frontend should treat `401 AUTHENTICATION_REQUIRED` as a signed-out/expired-session state.

Source: [`app.js`](../app.js), lines 40–57; [`authenticate.js`](../middleware/authenticate.js); [`auth.controller.js`](../controllers/auth.controller.js), lines 9–19 and 31–62.

### 2.3 Success envelopes

Most successful endpoints return:

```json
{
  "data": {}
}
```

Two implemented endpoints are exceptions: registration and login currently return a top-level `message` instead of a `data` envelope.

```json
{
  "message": "user: 42 logged in"
}
```

Do not depend on the message text to obtain the user ID. It is presentation text, not a stable structured user object. After registration or login, call `GET /users/me` to retrieve the current user.

Source: [`auth.controller.js`](../controllers/auth.controller.js), lines 21–57.

### 2.4 Error envelope

All handled failures use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "field": "name",
        "message": "Too small: expected string to have >=1 characters"
      }
    ]
  }
}
```

`details` is optional and is currently used for validated bodies and route IDs. Frontend code should branch on `error.code`, use `details[].field` for field-level errors when present, and regard `message` as displayable fallback text. Unexpected errors are hidden behind `500 INTERNAL_ERROR` / `An unexpected error occurred`.

The unmatched-route response is `404 NOT_FOUND` / `Route not found`. A malformed JSON body is also handled globally, but it is not translated to the standard validation contract. Express parser errors normally retain status `400`, receive the misleading code `INTERNAL_ERROR`, and expose the parser's message because only status `500` messages are masked.

Source: [`errors.js`](../middleware/errors.js); validation middleware in [`validate-auth.js`](../middleware/validate-auth.js), [`validate-band.js`](../middleware/validate-band.js), and [`validate-event.js`](../middleware/validate-event.js).

### 2.5 Identifier, date, time, and timestamp formats

| Value | JSON type and format |
| --- | --- |
| `bandId`, `eventId`, `userId`, `createdByUserId` | JSON number. Route IDs must be positive base-10 safe integers with no sign, decimal, or leading zero. |
| `date` | String `YYYY-MM-DD`, and must be a real calendar date. |
| `startTime`, `endTime` | String `HH:mm` in 24-hour local wall-clock time. |
| `timezone` | `UTC` or a runtime-supported IANA-style name containing `/`, e.g. `America/New_York`. Abbreviations such as `EST` are rejected. |
| `createdAt`, `updatedAt` | PostgreSQL timestamps serialized by `pg`; event timestamps are explicitly converted to ISO 8601. Treat all timestamp fields as opaque ISO date-time strings. |

Source: [`validate-band.js`](../middleware/validate-band.js), lines 12–16; [`validate-event.js`](../middleware/validate-event.js), lines 11–22 and 68–72; [`event-schedule.js`](../utils/event-schedule.js); [`event.controller.js`](../controllers/event.controller.js), lines 9–35.

## 3. Shared data models

### 3.1 Implemented current-user object

`GET /users/me` and `PATCH /users/me` return raw database column names:

```json
{
  "user_id": 42,
  "username": "alex",
  "first_name": "Alex",
  "last_name": "Rivera",
  "email": "alex@example.com",
  "plan": "free",
  "is_active": true,
  "created_at": "2026-08-30T12:00:00.000Z"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `user_id` | number | Account ID |
| `username` | string | Unique case-insensitive username |
| `first_name` | string | First name |
| `last_name` | string | Last name |
| `email` | string | Unique case-insensitive email |
| `plan` | `"free" \| "paid"` | Account plan; defaults to `free` |
| `is_active` | boolean | Active-account flag; authenticated reads only return active users |
| `created_at` | timestamp string | Account creation time |

Password hashes are never returned.

**Frontend warning:** the older scaffold spec proposed camelCase user fields and an `id` field. The implementation returns the snake_case shape above. Normalize this at the frontend API boundary if the UI uses camelCase.

Source: [`user.controller.js`](../controllers/user.controller.js), lines 5–21 and 24–36; [`schema.sql`](../db/schemas/schema.sql), lines 7–20.

### 3.2 Band member

```json
{
  "userId": 42,
  "username": "alex",
  "firstName": "Alex",
  "lastName": "Rivera",
  "role": "leader"
}
```

`role` is `leader` or `member`. Member objects intentionally omit email, plan, active state, timestamps, and credentials.

Source: [`band.controller.js`](../controllers/band.controller.js), lines 4–12; [`schema.sql`](../db/schemas/schema.sql), lines 1–4 and 38–51.

### 3.3 Band summary

```json
{
  "bandId": 7,
  "name": "The Examples",
  "isActive": true,
  "createdAt": "2026-08-30T12:00:00.000Z",
  "currentUserRole": "member"
}
```

A summary does not include `members`. It is used only in the band list.

Source: [`band.controller.js`](../controllers/band.controller.js), lines 25–33 and 105–126.

### 3.4 Full band

```json
{
  "bandId": 7,
  "name": "The Examples",
  "isActive": true,
  "createdAt": "2026-08-30T12:00:00.000Z",
  "currentUserRole": "leader",
  "members": [
    {
      "userId": 42,
      "username": "alex",
      "firstName": "Alex",
      "lastName": "Rivera",
      "role": "leader"
    }
  ]
}
```

Only active users appear in `members`. The leader sorts first, followed by members ordered by case-insensitive username and then `userId`.

Source: [`band.controller.js`](../controllers/band.controller.js), lines 14–23 and 35–55.

### 3.5 Event

```json
{
  "eventId": 19,
  "bandId": 7,
  "name": "Friday Rehearsal",
  "type": "rehearsal",
  "date": "2026-09-04",
  "startTime": "18:30",
  "endTime": "20:30",
  "timezone": "America/New_York",
  "location": "Studio A",
  "description": "Bring the new charts",
  "createdByUserId": 42,
  "isActive": true,
  "createdAt": "2026-08-30T12:00:00.000Z",
  "updatedAt": "2026-08-30T12:00:00.000Z"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `eventId` | number | Event ID |
| `bandId` | number | Owning band ID |
| `name` | string | 1–100 characters after trimming |
| `type` | `"rehearsal" \| "performance"` | Closed enum |
| `date` | string | Local calendar date, `YYYY-MM-DD` |
| `startTime` | string | Local start, `HH:mm` |
| `endTime` | string | Local end, `HH:mm`; must be later on the same day |
| `timezone` | string | IANA timezone used to interpret the local schedule |
| `location` | string | 1–255 characters after trimming |
| `description` | string or `null` | Up to 2,000 characters; blank input normalizes to `null` |
| `createdByUserId` | number | User who created it; supplied by the session, not by clients |
| `isActive` | boolean | Current endpoints only expose active events |
| `createdAt` | timestamp string | Creation instant |
| `updatedAt` | timestamp string | Last edit instant; initially equals creation time |

Events are visible to the band's current members; there is no attendee/RSVP model.

Source: [`event.controller.js`](../controllers/event.controller.js), lines 19–35; [`validate-event.js`](../middleware/validate-event.js), lines 11–39; [`schema.sql`](../db/schemas/schema.sql), lines 53–76.

## 4. Complete route index

| Method | Path | Access | Controller/function | Success |
| --- | --- | --- | --- | --- |
| GET | `/health` | Public | `getHealth` | `200` database health |
| POST | `/auth/register` | Public, rate limited | `register` | `201`, session created |
| POST | `/auth/login` | Public, rate limited | `login` | `200`, session created |
| POST | `/auth/logout` | Public | `logout` | `200`, session destroyed if present |
| GET | `/users/me` | Authenticated | `getMe` | `200`, current user |
| PATCH | `/users/me` | Authenticated | `updateMe` | `200`, updated current user |
| DELETE | `/users/me` | Authenticated | `deactivateMe` | `200`, account/session deactivated |
| POST | `/bands` | Authenticated | `createBand` | `201`, full band |
| GET | `/bands` | Authenticated | `listBands` | `200`, band summaries |
| GET | `/bands/:bandId` | Band member | `getBand` | `200`, full band |
| PATCH | `/bands/:bandId` | Band leader | `updateBand` | `200`, full band |
| DELETE | `/bands/:bandId` | Band leader | `deleteBand` | `200`, soft deleted |
| POST | `/bands/:bandId/members` | Band leader | `addBandMember` | `201`, added member |
| POST | `/bands/:bandId/events` | Band leader | `createEvent` | `201`, event |
| GET | `/bands/:bandId/events` | Band member | `listEvents` | `200`, events |
| GET | `/bands/:bandId/events/:eventId` | Band member | `getEvent` | `200`, event |
| PATCH | `/bands/:bandId/events/:eventId` | Band leader | `updateEvent` | `200`, event |
| DELETE | `/bands/:bandId/events/:eventId` | Band leader | `deleteEvent` | `200`, soft deleted |

Source: [`app.js`](../app.js), lines 59–64; all files in [`routes/`](../routes/).

## 5. Health

### `GET /health`

Checks whether the API can execute `SELECT 1` against PostgreSQL. No authentication, parameters, query, or body is used.

Success — `200`:

```json
{
  "data": {
    "status": "ok"
  }
}
```

Database failure — `503`:

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "Database is unavailable"
  }
}
```

Source: [`health.routes.js`](../routes/health.routes.js); [`health.controller.js`](../controllers/health.controller.js).

## 6. Authentication

Source for routing, rate limits, and middleware order: [`auth.routes.js`](../routes/auth.routes.js). Source for body validation: [`validate-auth.js`](../middleware/validate-auth.js). Source for session/database behavior: [`auth.controller.js`](../controllers/auth.controller.js).

### 6.1 `POST /auth/register`

Creates an active free-plan user, regenerates the session, and signs that user in.

Body — every field required; unknown fields rejected:

```json
{
  "username": "alex",
  "firstName": "Alex",
  "lastName": "Rivera",
  "email": "alex@example.com",
  "password": "correct horse battery staple"
}
```

| Field | Required | Validation and normalization |
| --- | --- | --- |
| `username` | Yes | String; trimmed; 3–50 characters |
| `firstName` | Yes | String; trimmed; 1–50 characters |
| `lastName` | Yes | String; trimmed; 1–50 characters |
| `email` | Yes | String; trimmed; valid email; maximum 254 characters; lowercased |
| `password` | Yes | String; 8–72 JavaScript string characters in the current implementation; not trimmed |

Success — `201` and a new `bandos.sid` session cookie:

```json
{
  "message": "user: 42 logged in"
}
```

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing, wrong-type, invalid, too-short/long, or unknown body field |
| 409 | `ACCOUNT_CONFLICT` | Username or email already exists, case-insensitively |
| 429 | `TOO_MANY_ATTEMPTS` | More than 5 registration requests from the rate-limit key in 1 hour |
| 500 | `INTERNAL_ERROR` | Hashing, database, or session failure |

The 409 response deliberately does not say whether username or email caused the conflict. Database uniqueness is case-insensitive.

### 6.2 `POST /auth/login`

Validates credentials, rejects inactive users, regenerates the session, and signs the user in.

Body — every field required; unknown fields rejected:

```json
{
  "email": "alex@example.com",
  "password": "correct horse battery staple"
}
```

| Field | Required | Validation and normalization |
| --- | --- | --- |
| `email` | Yes | String; trimmed; valid email; maximum 254 characters; lowercased |
| `password` | Yes | String; 1–72 characters; not trimmed |

Success — `200` and a new `bandos.sid` session cookie:

```json
{
  "message": "user: 42 logged in"
}
```

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid or unknown body field |
| 401 | `INVALID_CREDENTIALS` | Email unknown, password wrong, or account inactive |
| 429 | `TOO_MANY_ATTEMPTS` | More than 10 login requests from the rate-limit key in 15 minutes |
| 500 | `INTERNAL_ERROR` | Database, password comparison, or session failure |

The `401` message is always `Invalid email or password`; it intentionally does not reveal whether an account exists or is inactive.

### 6.3 `POST /auth/logout`

Destroys the current session if one exists and clears `bandos.sid`. The route itself does not require authentication and ignores any body.

Success — `200`:

```json
{
  "data": {
    "message": "Logged out"
  }
}
```

Calling logout while already signed out normally has the same successful response. A session-store destruction failure becomes `500 INTERNAL_ERROR`.

## 7. Current user

All routes in this section require a session containing `userId`. They also verify the targeted user is still active when reading or mutating the row.

Source: [`user.routes.js`](../routes/user.routes.js); [`authenticate.js`](../middleware/authenticate.js); [`user.controller.js`](../controllers/user.controller.js).

### 7.1 `GET /users/me`

No path parameters, query, or body.

Success — `200`:

```json
{
  "data": {
    "user": {
      "user_id": 42,
      "username": "alex",
      "first_name": "Alex",
      "last_name": "Rivera",
      "email": "alex@example.com",
      "plan": "free",
      "is_active": true,
      "created_at": "2026-08-30T12:00:00.000Z"
    }
  }
}
```

Errors: `401 AUTHENTICATION_REQUIRED` when the cookie/session is absent or the session's user is no longer active; otherwise unexpected failures become `500 INTERNAL_ERROR`.

### 7.2 `PATCH /users/me`

Updates profile fields on the active current user.

Intended useful body:

```json
{
  "username": "new-name",
  "firstName": "New",
  "lastName": "Name"
}
```

All three fields are optional at the controller level; omitted values retain their stored values. Success returns the same snake_case current-user object as `GET /users/me`.

Success — `200`:

```json
{
  "data": {
    "user": {
      "user_id": 42,
      "username": "new-name",
      "first_name": "New",
      "last_name": "Name",
      "email": "alex@example.com",
      "plan": "free",
      "is_active": true,
      "created_at": "2026-08-30T12:00:00.000Z"
    }
  }
}
```

**Important implemented limitation:** this route currently has no Zod validation middleware. Therefore:

- `{}` is accepted and returns the unchanged user;
- unknown body properties are silently ignored;
- values are not trimmed;
- the documented account field lengths are not enforced by this route before SQL;
- explicit `null` acts like omission because SQL uses `COALESCE`;
- invalid types or oversized strings may produce PostgreSQL errors and ultimately `500 INTERNAL_ERROR`;
- a duplicate username produces global `409 ACCOUNT_CONFLICT` with the message `Username or email is already in use`.

Frontend clients should still send only a non-empty subset of valid strings: `username` 3–50, `firstName` 1–50, and `lastName` 1–50. Do not rely on permissive behavior; it is a backend validation gap.

### 7.3 `DELETE /users/me`

Confirms the current password, soft-deactivates the account by setting `is_active = false`, destroys the session, and clears the cookie.

Body:

```json
{
  "password": "correct horse battery staple"
}
```

Success — `200`:

```json
{
  "data": {
    "message": "Account deactivated"
  }
}
```

Errors:

| Status | Code | When |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Session absent or user already inactive |
| 401 | `INVALID_CREDENTIALS` | Supplied password does not match |
| 500 | `INTERNAL_ERROR` | Invalid/missing body data causes a password-library error, or database/session destruction fails |

**Important implemented limitation:** there is no body validation. Unknown properties are ignored, and a missing or non-string `password` is not cleanly converted to `400 VALIDATION_ERROR`. Send exactly one string `password` field.

Deactivation does not delete the user, their band memberships, bands, or events. Because active-user filters are used elsewhere, the deactivated user disappears from band member lists and can no longer log in.

## 8. Bands

Every band route requires authentication. Routes targeting `:bandId` first validate a positive integer ID, then load an active band only if the current user belongs to it. Consequently, an unknown band, inactive band, or band belonging to someone else all return the same `404 BAND_NOT_FOUND` response.

Source for middleware order: [`band.routes.js`](../routes/band.routes.js). Source for access rules: [`band-access.js`](../middleware/band-access.js). Source for validation: [`validate-band.js`](../middleware/validate-band.js). Source for behavior and mappings: [`band.controller.js`](../controllers/band.controller.js).

### 8.1 `POST /bands`

Creates a band and its creator's `leader` membership atomically.

Body — exact strict shape:

```json
{
  "name": "The Examples"
}
```

`name` is required, trimmed, and must contain 1–50 characters. Unknown fields are rejected.

Success — `201` with a full band. Its `members` array contains only the creator as `leader`, and `currentUserRole` is `leader`.

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, or `500 INTERNAL_ERROR`. Duplicate band names are allowed.

### 8.2 `GET /bands`

Returns all active bands the current user belongs to. No query filters or pagination are supported.

Success — `200`:

```json
{
  "data": {
    "bands": []
  }
}
```

Items are band summaries, sorted by `createdAt` ascending and then `bandId` ascending. A user with no active band memberships gets an empty array.

Errors: `401 AUTHENTICATION_REQUIRED` or `500 INTERNAL_ERROR`.

### 8.3 `GET /bands/:bandId`

Available to both leaders and ordinary members. Returns a full band with active members.

Success — `200`:

```json
{
  "data": {
    "band": {}
  }
}
```

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `bandId` is not a positive base-10 safe integer |
| 401 | `AUTHENTICATION_REQUIRED` | No session |
| 404 | `BAND_NOT_FOUND` | Unknown, inactive, or inaccessible band |
| 500 | `INTERNAL_ERROR` | Unexpected failure |

### 8.4 `PATCH /bands/:bandId`

Leader-only full replacement of the band's only editable field.

Body — exact strict shape:

```json
{
  "name": "A Better Band Name"
}
```

`name` is required, trimmed, and 1–50 characters. This is not an optional-field patch: `{}` fails validation. Unknown fields are rejected.

Success — `200` with the updated full band and freshly loaded active member list.

Errors include the shared band errors plus `403 LEADER_REQUIRED`. Validation runs before membership loading and leader authorization on this route, after authentication and ID validation. Thus an authenticated non-leader can receive body-validation details if they submit an invalid body.

### 8.5 `DELETE /bands/:bandId`

Leader-only soft deletion. It sets `is_active = false`; memberships and events remain stored.

Success — `200`:

```json
{
  "data": {
    "message": "Band deleted"
  }
}
```

After deletion, the band disappears from lists and all band/event routes return `404 BAND_NOT_FOUND`, including for former members. The body is ignored.

Errors: shared band errors plus `403 LEADER_REQUIRED`.

### 8.6 `POST /bands/:bandId/members`

Leader-only addition of an existing active user as an ordinary member. Lookup is by case-insensitive username.

Body — exact strict shape:

```json
{
  "username": "alex"
}
```

`username` is required, trimmed, and 3–50 characters. Unknown fields are rejected.

Success — `201`:

```json
{
  "data": {
    "member": {
      "userId": 42,
      "username": "alex",
      "firstName": "Alex",
      "lastName": "Rivera",
      "role": "member"
    }
  }
}
```

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid ID or body |
| 401 | `AUTHENTICATION_REQUIRED` | No session |
| 403 | `LEADER_REQUIRED` | Requester is an ordinary member |
| 404 | `BAND_NOT_FOUND` | Band unknown, inactive, or inaccessible |
| 404 | `USER_NOT_FOUND` | No active user matches the username |
| 409 | `USER_ALREADY_IN_BAND` | User already has any role in this band, including the leader adding themself |
| 500 | `INTERNAL_ERROR` | Unexpected failure |

There is currently no remove-member, leave-band, invite, change-role, or transfer-leadership endpoint.

## 9. Events

Events are nested beneath a band. Every route requires authentication, a valid `bandId`, and current membership in the active band. Item routes also validate `eventId` and load only an active event belonging to that already-authorized band.

Information hiding is deliberate:

- inaccessible or inactive band → `404 BAND_NOT_FOUND`;
- accessible band, but event is unknown, inactive, or owned by another band → `404 EVENT_NOT_FOUND`.

Source for route/middleware order: [`band.routes.js`](../routes/band.routes.js), lines 25–33; [`event.routes.js`](../routes/event.routes.js). Source for access: [`band-access.js`](../middleware/band-access.js); [`event-access.js`](../middleware/event-access.js). Source for validation and schedules: [`validate-event.js`](../middleware/validate-event.js); [`event-schedule.js`](../utils/event-schedule.js). Source for controller behavior: [`event.controller.js`](../controllers/event.controller.js).

### 9.1 Event request fields

| Field | Create | Patch | Rules |
| --- | --- | --- | --- |
| `name` | Required | Optional | String, trimmed, 1–100 characters |
| `type` | Required | Optional | Exactly `rehearsal` or `performance` |
| `date` | Required | Optional | Real `YYYY-MM-DD` calendar date |
| `startTime` | Required | Optional | Exact 24-hour `HH:mm` |
| `endTime` | Required | Optional | Exact `HH:mm`; later than `startTime` on same date |
| `timezone` | Required | Optional | Trimmed; max 255; `UTC` or supported IANA-style name containing `/` |
| `location` | Required | Optional | String, trimmed, 1–255 characters |
| `description` | Optional | Optional | String trimmed to max 2,000, or `null`; empty string normalizes to `null` |

Both bodies are strict: unknown keys fail. Create normalizes omitted `description` to `null`. Patch requires at least one recognized field.

Schedule rules:

- Event start must be strictly in the future for create and for the complete proposed schedule after a patch.
- Events cannot cross midnight; `endTime` must be later than `startTime` on the same local date.
- The local date/time must exist in the timezone. A nonexistent daylight-saving-transition time is rejected.
- During an ambiguous fall-back overlap, schedule resolution consistently chooses the earlier occurrence.
- Stored values remain local calendar fields plus timezone; responses do not convert them to the browser or server timezone.

### 9.2 `POST /bands/:bandId/events`

Leader-only event creation. `bandId` and `createdByUserId` come from trusted request/session context and must not be sent in the body.

Body example:

```json
{
  "name": "Friday Rehearsal",
  "type": "rehearsal",
  "date": "2026-09-04",
  "startTime": "18:30",
  "endTime": "20:30",
  "timezone": "America/New_York",
  "location": "Studio A",
  "description": "Bring the new charts"
}
```

Success — `201`:

```json
{
  "data": {
    "event": {}
  }
}
```

The value is the complete event model. Duplicate names and duplicate schedules are allowed. Creation does not create attendee or notification records.

Errors include shared event access errors, `403 LEADER_REQUIRED`, and `400 VALIDATION_ERROR` for any field or schedule failure. Leader authorization runs before body validation, so ordinary members receive `403` without event-schema details.

### 9.3 `GET /bands/:bandId/events`

Available to leaders and ordinary members. Returns every active event in the band with complete event representations. There are no filters, query parameters, or pagination.

Success — `200`:

```json
{
  "data": {
    "events": []
  }
}
```

Ordering uses each event's actual timezone-aware start instant at query time:

1. Future events first, soonest to latest.
2. Started and historical events next, most recently started to oldest.
3. `eventId` ascending as the deterministic tie-breaker.

An event starting exactly at the database's current timestamp is in the started/historical group. A band with no active events gets an empty array.

### 9.4 `GET /bands/:bandId/events/:eventId`

Available to leaders and ordinary members.

Success — `200`:

```json
{
  "data": {
    "event": {}
  }
}
```

The value is the complete event model.

Errors include `400 VALIDATION_ERROR` for either malformed ID, `401 AUTHENTICATION_REQUIRED`, `404 BAND_NOT_FOUND`, `404 EVENT_NOT_FOUND`, and unexpected `500 INTERNAL_ERROR`.

### 9.5 `PATCH /bands/:bandId/events/:eventId`

Leader-only partial update. Any non-empty subset of the event request fields is accepted; omitted fields are merged from the stored event and the complete proposed schedule is revalidated.

Example:

```json
{
  "location": "Studio B",
  "description": null
}
```

Success — `200` with the complete updated event. Every successful patch updates `updatedAt`, even if the submitted value equals the stored value.

Lifecycle behavior is atomic:

- If the stored event has reached or passed its actual timezone-aware start instant, no edit is allowed, even an edit that would move it back into the future.
- Otherwise the merged proposed schedule must still begin strictly in the future.
- The row is locked during this decision to prevent concurrent edits from bypassing the boundary.

Additional error:

```json
{
  "error": {
    "code": "EVENT_ALREADY_STARTED",
    "message": "Events cannot be edited after they have started"
  }
}
```

This is status `409`. Other errors are shared event access, leader, validation, and internal errors. Event existence is loaded before leader authorization; within an accessible band, an unknown event returns `404 EVENT_NOT_FOUND` even for an ordinary member.

### 9.6 `DELETE /bands/:bandId/events/:eventId`

Leader-only soft deletion. Deletion is allowed before or after the event starts.

Success — `200`:

```json
{
  "data": {
    "message": "Event deleted"
  }
}
```

After deletion, the event disappears from lists and direct reads, edits, and repeated deletes return `404 EVENT_NOT_FOUND`. The body is ignored. Stored event data remains in the database with `is_active = false`; deletion does not change `updatedAt`.

## 10. Error-code catalog

| Status | Code | Meaning / frontend action |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Request ID or validated body failed. Show field messages when `details` exists. |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/expired session or inactive current user. Move the UI to signed-out state. |
| 401 | `INVALID_CREDENTIALS` | Login email/password invalid, account inactive, or deactivation password wrong. |
| 403 | `LEADER_REQUIRED` | Current user is in the band but only a leader may perform this mutation. |
| 404 | `NOT_FOUND` | No mounted route matched. |
| 404 | `BAND_NOT_FOUND` | Band missing, inactive, or hidden because the requester is not a member. |
| 404 | `EVENT_NOT_FOUND` | Within an accessible band, event missing, inactive, or belongs elsewhere. |
| 404 | `USER_NOT_FOUND` | No active account matches the member-add username. |
| 409 | `ACCOUNT_CONFLICT` | Case-insensitive username/email uniqueness conflict. Also used by current profile username collisions. |
| 409 | `USER_ALREADY_IN_BAND` | Target user already belongs to the band. |
| 409 | `EVENT_ALREADY_STARTED` | A leader attempted to edit an event at/after its start instant. |
| 426 | `HTTPS_REQUIRED` | Production request used plain HTTP. Retry through HTTPS. |
| 429 | `TOO_MANY_ATTEMPTS` | Registration or login rate limit reached. Respect standard rate-limit headers. |
| 500 | `INTERNAL_ERROR` | Unexpected backend failure. Do not assume retry is safe for mutations. |
| 503 | `DATABASE_UNAVAILABLE` | Health check could not reach PostgreSQL. |

Source: [`errors.js`](../middleware/errors.js), route/controller/middleware sources cited in each endpoint section.

## 11. Authorization and visibility matrix

| Operation | Signed out | Authenticated outsider | Band member | Band leader |
| --- | --- | --- | --- | --- |
| Health/register/login/logout | Allowed | Allowed | Allowed | Allowed |
| Current-user routes | `401` | Allowed | Allowed | Allowed |
| Create/list bands | `401` | Allowed | Allowed | Allowed |
| Read targeted band | `401` | `404 BAND_NOT_FOUND` | Allowed | Allowed |
| Edit/delete targeted band | `401` | `404 BAND_NOT_FOUND` | `403 LEADER_REQUIRED` | Allowed |
| Add band member | `401` | `404 BAND_NOT_FOUND` | `403 LEADER_REQUIRED` | Allowed |
| List/read band events | `401` | `404 BAND_NOT_FOUND` | Allowed | Allowed |
| Create/edit/delete event | `401` | `404 BAND_NOT_FOUND` | `403 LEADER_REQUIRED`* | Allowed |

`*` On event item mutations, a missing/inactive/cross-band event returns `404 EVENT_NOT_FOUND` before the member's leader check. On collection creation, the leader check occurs immediately after band access.

Source: [`band.routes.js`](../routes/band.routes.js); [`event.routes.js`](../routes/event.routes.js); [`band-access.js`](../middleware/band-access.js); [`event-access.js`](../middleware/event-access.js).

## 12. Frontend implementation guidance

### 12.1 Recommended API-layer responsibilities

Keep backend peculiarities at one frontend boundary:

1. Always use `credentials: 'include'`.
2. Parse non-2xx responses through the shared error envelope.
3. After register/login, fetch `/users/me` rather than parsing the login message.
4. Normalize the snake_case current-user response into the frontend's preferred model.
5. Preserve event `date`, time, and timezone as separate fields. Do not convert the submitted local schedule into UTC before sending it.
6. Use `currentUserRole === 'leader'` to show mutation controls, while still handling `403` because authorization is enforced server-side.
7. On `401 AUTHENTICATION_REQUIRED`, clear cached authenticated state. On `404 BAND_NOT_FOUND`, remove inaccessible/deleted band context. On `404 EVENT_NOT_FOUND`, remove the event from local state.
8. Treat delete endpoints as soft deletes but remove their resources from normal UI collections immediately after success.

### 12.2 Features the frontend must not assume exist

The current API has no endpoint for:

- checking auth without fetching `/users/me`;
- refreshing a token (authentication is cookie-session based);
- changing email or password;
- password recovery or email verification;
- reactivating an account;
- removing a band member, leaving a band, changing roles, or transferring leadership;
- event attendees, RSVPs, invites, reminders, or notifications;
- event/band search, filtering, sorting controls, or pagination;
- hard deletion of users, bands, or events.

These omissions follow from the complete mounted route set in [`app.js`](../app.js) and [`routes/`](../routes/).

## 13. Known implementation gaps and contract risks

These are facts the frontend must account for and backend maintainers should resolve deliberately:

1. **Auth success envelope mismatch.** Register/login return `{ "message": ... }`, while other successes use `{ "data": ... }` and the earlier scaffold spec called for uniform success envelopes. Source: [`auth.controller.js`](../controllers/auth.controller.js), lines 34 and 56.
2. **User casing mismatch.** Current-user endpoints expose raw snake_case database fields, while band/event payloads are camelCase and the scaffold spec proposed camelCase users. Source: [`user.controller.js`](../controllers/user.controller.js), lines 5–7 and 19–36.
3. **Missing current-user mutation validation.** `PATCH` and `DELETE /users/me` have no validation middleware, so malformed inputs do not follow the intended `400 VALIDATION_ERROR` contract. Source: [`user.routes.js`](../routes/user.routes.js); [`user.controller.js`](../controllers/user.controller.js), lines 24–49.
4. **Password length semantics.** Zod's string maximum counts JavaScript string units, while bcrypt's practical input boundary is byte-oriented; the implementation does not enforce the scaffold spec's “72 UTF-8 bytes” wording. Source: [`validate-auth.js`](../middleware/validate-auth.js), lines 4–15.
5. **Malformed JSON mapping.** JSON parser syntax errors are not specially translated. Express parser errors normally retain status `400` but receive code `INTERNAL_ERROR` and expose the parser message instead of using `400 VALIDATION_ERROR`. Source: [`app.js`](../app.js), line 39; [`errors.js`](../middleware/errors.js), lines 7–25.
6. **App lifecycle/testability.** `app.js` starts listening whenever required and does not export `app`, despite the earlier scaffold spec describing conditional startup/export. This affects automated integration harnesses more than browser clients. Source: [`app.js`](../app.js), lines 16 and 66–68.

Until the backend changes, this master contract's endpoint sections describe the implemented behavior. When any route, validation schema, mapper, error translation, or response envelope changes, update this document in the same change.

## 14. Maintenance checklist

Before treating a future version of this contract as current, compare it against:

- router mounts in [`app.js`](../app.js);
- every file in [`routes/`](../routes/);
- request validation in [`middleware/`](../middleware/);
- response mappings and status codes in [`controllers/`](../controllers/);
- event scheduling semantics in [`event-schedule.js`](../utils/event-schedule.js);
- persisted constraints/enums in [`schema.sql`](../db/schemas/schema.sql).

For every new or changed endpoint, record method/path, authentication and role, middleware order, exact body/query/path rules, normalization, success status/shape, error codes, ordering/pagination, side effects, and soft-delete/visibility behavior here.
