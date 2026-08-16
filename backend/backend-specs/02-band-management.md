# Band Management Specification

## Goal and scope

Add authenticated band management to the Bandos REST API. A user can create a band, list every active band they belong to, retrieve one active band they belong to, update or soft-delete a band when they are its leader, and add an active user to a band by username when they are its leader.

This specification covers band creation, reads, name updates, soft deletion, and adding members. Removing members, leaving a band, promoting members, transferring leadership, pagination, and restoring deleted bands are deferred to later specifications.

## Domain rules

- Every band is identified by `band_id`; band names are not globally unique.
- A band name is trimmed and must contain between 1 and 50 characters.
- Creating a band and its initial membership is one database transaction.
- The creator automatically becomes the band's single `leader`.
- This API exposes no operation that changes leadership. Creating the leader transactionally and omitting leadership-changing operations is sufficient for this scope; a stricter database-level exactly-one-leader rule is deferred until leadership transfer is designed.
- Every other added user receives the `member` role.
- A user can have at most one membership row per band.
- Only active bands appear in normal API operations.
- Only active users can be added to a band.
- Username lookup is case-insensitive.
- A leader's authority comes from their current `user_bands.role`, not from a separate creator field.
- Deleting a band is a soft delete that sets `bands.is_active` to `false`. Membership rows remain stored.
- Band lists and member lists are unpaginated for this MVP.

## HTTP contract

All endpoints are below `/api/v1/bands` and require an authenticated session. Successful bodies use `{ "data": ... }`; failures use `{ "error": { "code", "message", "details"? } }`.

| Method | Endpoint | Required access | Behavior |
| --- | --- | --- | --- |
| POST | `/bands` | Authenticated user | Creates a band and makes the current user its leader. |
| GET | `/bands` | Authenticated user | Lists lightweight summaries of active bands the current user belongs to. |
| GET | `/bands/:bandId` | Band member | Returns the active band and all of its members. |
| PATCH | `/bands/:bandId` | Band leader | Updates the band's name. |
| DELETE | `/bands/:bandId` | Band leader | Soft-deletes the band. |
| POST | `/bands/:bandId/members` | Band leader | Finds an active user by username and adds them as a member. |

### Request bodies

`POST /bands` accepts exactly:

```json
{
  "name": "The Examples"
}
```

`PATCH /bands/:bandId` accepts exactly the same shape. `name` is required because it is the only editable field.

`POST /bands/:bandId/members` accepts exactly:

```json
{
  "username": "alex"
}
```

Unknown properties are rejected. `name` and `username` are trimmed. A band name must be 1–50 characters. A username must be 3–50 characters, matching account username limits. Route `bandId` values must be positive base-10 integers. A malformed or non-positive ID returns `400 VALIDATION_ERROR`.

### Response representations

Controllers map PostgreSQL snake_case columns to camelCase API fields rather than returning database rows directly.

A full band representation is:

```json
{
  "data": {
    "band": {
      "bandId": 12,
      "name": "The Examples",
      "isActive": true,
      "createdAt": "2026-08-16T15:00:00.000Z",
      "currentUserRole": "leader",
      "members": [
        {
          "userId": 8,
          "username": "alex",
          "firstName": "Alex",
          "lastName": "Smith",
          "role": "member"
        }
      ]
    }
  }
}
```

Member representations do not expose email addresses or password hashes.

`GET /bands` returns lightweight summaries sorted deterministically by `createdAt` ascending, then `bandId` ascending:

```json
{
  "data": {
    "bands": [
      {
        "bandId": 12,
        "name": "The Examples",
        "isActive": true,
        "createdAt": "2026-08-16T15:00:00.000Z",
        "currentUserRole": "leader"
      }
    ]
  }
}
```

An authenticated user with no memberships receives `200` with `{ "data": { "bands": [] } }`.

`POST /bands` returns `201` with the full band representation. Its member list contains the creator with the `leader` role.

`GET /bands/:bandId` returns `200` with the full band representation. Members are sorted by role with the leader first, then by case-insensitive username, then `userId`.

`PATCH /bands/:bandId` returns `200` with the updated full band representation.

`DELETE /bands/:bandId` returns:

```json
{
  "data": {
    "message": "Band deleted"
  }
}
```

`POST /bands/:bandId/members` returns `201` with only the added member:

```json
{
  "data": {
    "member": {
      "userId": 8,
      "username": "alex",
      "firstName": "Alex",
      "lastName": "Smith",
      "role": "member"
    }
  }
}
```

## Access control and middleware

Mount `authenticate` for the entire band router. Authentication must run before validation that queries band access.

Add `loadBandMembership` for routes containing `:bandId`. It must perform one parameterized query that selects the active band only when the current session user has a membership. On success it attaches a normalized band record and the current user's role to request-local state for downstream middleware and controllers. On no match it raises `404 BAND_NOT_FOUND` with `Band not found`.

The same `404` covers:

- an unknown band ID;
- an inactive band; and
- an active band the requester does not belong to.

This prevents outsiders from discovering whether a band exists.

Add `requireBandLeader` after `loadBandMembership` on update, delete, and add-member routes. It permits the request only when the loaded membership role is `leader`; an ordinary member receives `403 LEADER_REQUIRED` with `Band leader access required`.

The intended middleware order is:

```text
router-level authenticate
        -> validate route parameter/body
        -> loadBandMembership (member-scoped routes)
        -> requireBandLeader (leader-only routes)
        -> controller
```

`POST /bands` and `GET /bands` do not use membership middleware because they do not target an existing band.

## Persistence changes

Harden `user_bands` in the disposable baseline schema:

- make `user_id` and `band_id` `NOT NULL`;
- add `UNIQUE (user_id, band_id)` so a user cannot join the same band twice;
- add an index supporting membership lookup by `user_id` and band listing;
- add an index supporting band member lookup by `band_id`;
- use foreign keys to `users(user_id)` and `bands(band_id)` with explicit deletion behavior.

Use `ON DELETE RESTRICT` for both foreign keys in this scope. Application behavior deactivates users and bands instead of physically deleting them, so membership history remains intact. Correct the existing `fk_bands_talbe` typo when naming the replacement constraint.

No global unique constraint is added to `bands.name`. Preserve `role_type ('leader', 'member')` and `bands.is_active`.

Because the baseline schema is documented as disposable and migrations are deferred, edit `db/schemas/schema.sql` directly. Verification should recreate the local development database before applying it.

## Controller behavior

### Create a band

1. Acquire a client from the PostgreSQL pool.
2. Begin a transaction.
3. Insert the active band and return its fields.
4. Insert `(current user, new band, leader)` into `user_bands`.
5. Commit the transaction.
6. Return the full band representation with the creator as its leader.
7. Roll back on any failure and always release the client.

This operation must never leave a band without its creator membership.

### List the current user's bands

Join `bands` to `user_bands`, restrict by the session user ID and `bands.is_active = true`, and return only summary fields plus the current user's role. Do not fetch members for this endpoint.

### Get one band

Use the band loaded by access middleware and query all memberships joined to active users. Return the full representation, including `currentUserRole` and the sanitized member list. Inactive users are omitted from the returned member list, although their historical membership rows remain stored.

### Update a band

After member loading and leader authorization, update only `name`, requiring `band_id` and `is_active = true` in the SQL predicate. Return the updated full representation. If the guarded update unexpectedly finds no row, return `404 BAND_NOT_FOUND`.

### Soft-delete a band

After member loading and leader authorization, set `is_active = false` using a guarded update that also requires `is_active = true`. Do not delete membership rows. If the guarded update unexpectedly finds no row, return `404 BAND_NOT_FOUND`.

After deletion, all members must stop seeing the band in list and single-band reads. Further update, delete, and add-member attempts receive `404 BAND_NOT_FOUND`.

### Add a member by username

After member loading and leader authorization:

1. Find one active user with `LOWER(username) = LOWER($1)`.
2. If none exists, return `404 USER_NOT_FOUND` with `User not found`.
3. Insert a `user_bands` row with role `member`.
4. Return the sanitized member representation with `201`.

The unique membership constraint is the concurrency-safe authority for duplicates. Map its specific violation to `409 USER_ALREADY_IN_BAND` with `User is already a member of this band`. This includes a leader submitting their own username. Do not rely only on a pre-insert existence check.

## Error contract

| Status | Code | Situation |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid body, unknown body properties, or invalid `bandId`. |
| 401 | `AUTHENTICATION_REQUIRED` | No authenticated session. |
| 403 | `LEADER_REQUIRED` | A band member attempts a leader-only operation. |
| 404 | `BAND_NOT_FOUND` | Band is unknown, inactive, or inaccessible to the requester. |
| 404 | `USER_NOT_FOUND` | No active user matches the submitted username. |
| 409 | `USER_ALREADY_IN_BAND` | The selected user already has a membership in the band. |
| 500 | `INTERNAL_ERROR` | Unexpected database or application failure. |

Do not let the global PostgreSQL `23505` handler turn membership conflicts into `ACCOUNT_CONFLICT`. The add-member operation must identify the membership unique constraint and translate it to `USER_ALREADY_IN_BAND`; unrelated unique violations continue through normal error handling.

## File-level design

Implement the feature in these locations:

- `db/schemas/schema.sql`: harden memberships and add indexes.
- `middleware/validate-band.js`: strict body schemas and positive-integer `bandId` validation.
- `middleware/band-access.js`: `loadBandMembership` and `requireBandLeader`.
- `controllers/band.controller.js`: band queries, mutations, transactions, and response mapping.
- `routes/band.routes.js`: authenticated route definitions and middleware ordering.
- `app.js`: mount the router at `/api/v1/bands`.
- `middleware/errors.js`: only if a narrowly scoped shared constraint mapping is preferable to translating the membership conflict in the controller.

Keep the existing route-to-controller-to-database architecture. Do not introduce an ORM or service layer for this feature.

## Sequential implementation plan

Each slice should be completed and checked before beginning the next.

### 1. Harden band membership persistence

- Update `user_bands` nullability, uniqueness, foreign keys, and indexes.
- Recreate the disposable local database from the schema.
- Verify PostgreSQL rejects null and duplicate memberships and permits duplicate band names.

### 2. Add band input validation

- Add strict schemas for create, update, and add-member bodies.
- Add positive-integer `bandId` parameter validation.
- Verify trimmed values replace the original request values and invalid input reaches the standard error handler.

### 3. Add membership access middleware

- Implement active-band membership loading.
- Implement leader authorization.
- Verify outsider, member, leader, unknown-band, and inactive-band behavior independently.

### 4. Implement creation and lightweight listing

- Implement transactional creation with automatic leader membership.
- Implement `GET /bands` summaries.
- Add the two collection routes and mount the router.
- Verify empty lists, multiple memberships, duplicate names, transaction rollback, and response casing.

### 5. Implement the single-band read

- Query and sanitize active band members.
- Add `GET /bands/:bandId` with membership middleware.
- Verify member ordering, omission of email/password data, and `404` information hiding.

### 6. Implement leader-only update

- Add the guarded name update.
- Return the refreshed full band representation.
- Verify a leader succeeds, a member receives `403`, and an outsider receives `404`.

### 7. Implement leader-only soft deletion

- Add the guarded `is_active = false` update.
- Verify the deleted band disappears for every member and all subsequent targeted operations receive `404`.

### 8. Implement adding a member

- Add case-insensitive active-user lookup and membership insertion.
- Translate the membership constraint violation precisely.
- Verify successful addition, unknown and inactive users, duplicate membership, self-addition, member/outsider authorization, and immediate visibility to the added user.

### 9. Run an end-to-end smoke test

Using at least a leader, a member, and an outsider:

1. Create two bands with the same name under different users.
2. Confirm each creator is the sole leader of their new band.
3. Add a user by differently cased username.
4. Confirm both members list and retrieve the band.
5. Confirm the outsider cannot distinguish it from an unknown band.
6. Confirm the ordinary member cannot update, delete, or add another member.
7. Update the name as leader and confirm both members see it.
8. Exercise unknown-user and duplicate-member errors.
9. Soft-delete as leader and confirm the band is absent and inaccessible to everyone.
10. Confirm unrelated authentication and user endpoints still behave as specified.

## Completion criteria

The feature is complete when every endpoint follows the documented response and error contracts, all SQL is parameterized, band existence is hidden from outsiders, leader-only mutations are enforced in middleware, creation is atomic, duplicate memberships are prevented by the database, soft-deleted bands disappear from all normal operations, and the end-to-end smoke test passes.
