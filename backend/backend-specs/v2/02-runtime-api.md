# Delivered backend API reference

Verified 22 November 2026 for BE-V2-18. Product v2 continues to use `/api/v1`.
This reference describes the mounted backend; the [v1 reference](../v1/00-api-contract.md)
is a historical snapshot. The [shared contract](00-shared-contract.md) defines the
frontend handoff. [Verification evidence](tickets/18-verification-results.md)
maps each backend acceptance scenario to runnable checks. Frontend v2 interaction
and accessibility acceptance are separate.

## Transport, errors and retries

Use JSON and credentialed requests (`credentials: 'include'`). The PostgreSQL
session cookie is `bandos.sid`, HttpOnly, SameSite=Lax, Secure in production.
Production API traffic requires HTTPS (`426 HTTPS_REQUIRED`); only the exact
`GET /api/v1/health` probe is exempt. Configured client-origin CORS permits
credentials. Mutations with Origin must match `CLIENT_ORIGIN` or the request's
own origin; otherwise `403 ORIGIN_NOT_ALLOWED`. Non-browser requests may omit it.

Success is `{data:{...}}`, including register/login. Deletions return HTTP 200.
Errors are `{error:{code,message,details?,reason?}}`. Field validation uses dotted
paths, e.g. `slots.1.userId`. Malformed JSON returns `400 VALIDATION_ERROR` with
`details:[{field:'body',message:'Malformed JSON'}]`. Database/provider details
are not part of public error responses. IDs are positive safe-integer numbers;
route IDs are strict decimal strings without leading zeroes. Instants are UTC ISO
strings. Changed/new bodies reject unknown keys. Names/text are trimmed; passwords
are never trimmed.

| Status/code | Client recovery |
| --- | --- |
| 400 `VALIDATION_ERROR` | Retain draft and map field details. |
| 400 `TOKEN_INVALID_OR_EXPIRED` | Request a fresh link; missing/expired/used/wrong-purpose tokens are indistinguishable. |
| 401 `AUTHENTICATION_REQUIRED` | Clear protected caches; login. Optional reason: `idle_expired`, `absolute_expired`, `revoked`; missing session may have no reason. |
| 401 `INVALID_CREDENTIALS` | Credential failure, including deactivation; retain credential form. |
| 403 `EMAIL_VERIFICATION_REQUIRED` | Restricted account must verify. |
| 403 `CURRENT_PASSWORD_INCORRECT` | Account form error with field detail. |
| 403 `LEADER_REQUIRED` | Reload permissions. |
| 404 `BAND_NOT_FOUND`, `EVENT_NOT_FOUND`, `POLL_NOT_FOUND`, `INVITATION_NOT_FOUND` | Resource unavailable, hidden or outside current access. |
| 409 `STALE_VERSION` | Explicit reload; warn before discarding unsaved changes. Never automatically merge/resubmit. |
| 409 `EVENT_STARTED`, `POLL_CLOSED` | Refresh read-only state. |
| 409 `DEFAULT_LINEUP_INVALID`, `LEADERSHIP_TRANSFER_REQUIRED`, `ACCOUNT_CONFLICT`, `MEMBER_ALREADY_EXISTS` | Repair contextually, retaining valid input. Leadership failure has `details.bands` with owned band IDs/names. |
| 409 `IDEMPOTENCY_KEY_REUSED`, `REQUEST_IN_PROGRESS` | Correct key/body use, or retry the same pending intent. |
| 429 `TOO_MANY_ATTEMPTS` | Honor `Retry-After` seconds. |
| 503 `MAIL_UNAVAILABLE` | Security mail configuration unavailable; issuance did not succeed. |
| 500 `INTERNAL_ERROR` | Recoverable failure; do not claim save succeeded. |

Aggregate writes require the currently loaded `expectedVersion`: band, event,
poll or user as appropriate. Creation uses `templateVersion` for the loaded band.
Versions start at one. Poll voting additionally uses the caller's
`expectedVoteVersion` (zero if absent). Votes do not advance poll composition
version. No-op saves neither increment versions nor enqueue mail. Stale/invalid
writes have no domain/email effects.

All band/event/poll mutations and authenticated account mutations require a UUID
`Idempotency-Key`, except preference PUT. `/auth/*` endpoints (register/login/logout and token
issuance/confirmation) do not require that key. Authenticated `/users/me/email-change`
and `/users/me/email-change/resend` do require it. Records are scoped to actor,
method, path and key, retained seven days. Retry uncertain response loss with the
same key and identical body; changed intent gets a new key. Replay precedes stale
validation, but rechecks current access. Terminal state and domain uniqueness
still protect finalization after records expire. Permission flags are hints.

## Account and session routes

User wire fields are snake_case: `user_id,username,first_name,last_name,email,plan,
is_active,created_at,email_verified_at,pending_email,version`. Hashes, session
generation and raw tokens are excluded. Session shape is
`{access,authenticatedAt,idleExpiresAt,absoluteExpiresAt}`, where access is `full`
or `verification_required`. Deadlines are server instants: idle 24 hours,
absolute seven days after authentication. Successful user mutations count as
activity; explicit successful navigation GET uses `X-bandos-activity: user`.
Background/bootstrap/focus reads omit it. Failed requests and cookie/store touch
do not extend application deadlines. Mutations recheck expiry/revocation at commit.

| Method/path | JSON input | Success data (HTTP 200 unless stated) |
| --- | --- | --- |
| POST `/auth/register` | `username,firstName,lastName,email,password` | 201 `{user,session}`; restricted, verification queued. |
| POST `/auth/login` | `email,password` | `{user,session}`; full or restricted. |
| POST `/auth/logout` | None | `{message}`; optional session, repeatable. |
| GET `/users/me` | None | `{user,session}`; restricted sessions allowed. |
| POST `/auth/verification/resend` | `email` | 202 `{message}`; generic. |
| POST `/auth/verification/confirm` | `token` | `{message,user,session}`; null user/session unless original matching valid registration session continues. |
| POST `/auth/password/forgot` | `email` | 202 `{message}`; generic for known/unknown/inactive addresses. |
| POST `/auth/password/reset` | `token,newPassword` | `{message}`; all sessions revoked, no login or implicit verification. |
| POST `/users/me/password` | `expectedVersion,currentPassword,newPassword` | `{message}`; all sessions revoked including caller. |
| PATCH `/users/me` | `expectedVersion` and nonempty subset `username,firstName,lastName` | `{user}`. |
| POST `/users/me/email-change` | `expectedVersion,currentPassword,newEmail` | 202 `{user}`; active email retained, pending email staged. |
| POST `/users/me/email-change/resend` | `{}` | 202 `{message}`; current pending address. |
| POST `/auth/email-change/confirm` | `token` | `{message}`; swap verified email, revoke all sessions; login with new address. |
| DELETE `/users/me` | `expectedVersion,password` | `{message:'Account deactivated'}`; first transfer/delete all owned active bands. |
| GET `/users/me/notification-preferences` | None | `{preferences}`. |
| PUT `/users/me/notification-preferences` | `expectedVersion` and all seven booleans | `{preferences}`. |

Preferences are `{version,enabled,invitations,eventUpdates,removalsAndCancellations,
invitationResponses,pollUpdates,pollResponses}`. Master-off preserves category
choices. Security mail bypasses opt-outs. Restricted sessions can identify,
verify/resend, recover and logout; resource routes require active verified users.

Registration confirmation regenerates/promotes only the original valid matching
registration session, preserving authentication time/absolute deadline. Other
sessions are revoked. Token possession alone never creates/switches sessions.
Email/password/deactivation transitions revoke all devices atomically through
session generation. Account deactivation removes current memberships/future
assignments/open poll rows while preserving history. Former members lose access.

Verification/email-change links expire after 24 hours; reset after 30 minutes.
Tokens are random, hashed for lookup, purpose-bound and single-use. New issuance
revokes old unused tokens atomically. Shared normalized-address issuance limits
are 60-second cooldown and five/hour; additional IP limit twenty/hour. Failed
confirm submissions: ten/15 minutes/IP/purpose. Registration: five/hour/IP; login:
ten/15 minutes/IP. New passwords: at least eight characters, at most 72 UTF-8
bytes. Names: 1–50 characters, username 3–50, email at most 254, normalized
trimmed/lowercase. See [token details](../../db/account-tokens.md).

## Bands, catalogs and defaults

Band detail is `{bandId,name,version,isActive,currentUserRole,createdAt,members,
instruments,instrumentation,defaultLineup}`. Member fields include `userId,
username,firstName,lastName,role,instrumentIds` (no email).
Instrumentation is `[{slotId,instrumentId,label,position}]`; instruments are
`[{instrumentId,name}]`. Default is null or `{version,assignments:[{slotId,userId}],
isApplicable,invalidReasons}`. Reads recompute applicability; reasons are
`MISSING_SLOT`, `MEMBER_UNAVAILABLE`, `INSTRUMENT_INELIGIBLE`. Lists omit members.

| Method/path | Input | Success data |
| --- | --- | --- |
| GET `/instruments` | None | `{instruments}` starter choices. |
| POST `/bands` | `name,instrumentation:[{instrumentId,label}],leaderInstrumentIds?` | 201 `{band}`. Per-slot custom `instrumentName` replaces `instrumentId`. |
| GET `/bands` | None | `{bands}` current memberships only. |
| GET `/bands/:bandId` | None | `{band}` current member access. |
| PATCH `/bands/:bandId` | `name,expectedVersion` | `{band}`. |
| DELETE `/bands/:bandId` | `expectedVersion` | `{message:'Band deleted'}`; soft delete with atomic lifecycle cleanup. |
| POST `/bands/:bandId/instruments` | `name,expectedVersion` | 201 `{instrument,band}`; normalized duplicate returns existing instrument. |
| PATCH `/bands/:bandId/instrumentation` | `expectedVersion,slots:[{slotId?,instrumentId,label}]` | `{band}`; replace ordered template. |
| POST `/bands/:bandId/members` | `username,instrumentIds,expectedVersion` | 201 `{member,band}`; existing active verified account. |
| PATCH `/bands/:bandId/members/:userId` | `instrumentIds,expectedVersion` | `{member,band}`. |
| DELETE `/bands/:bandId/members/:userId` | `expectedVersion` | `{band}`; cannot remove owner. |
| POST `/bands/:bandId/ownership` | `userId,expectedVersion` | `{band}`; atomic sole-owner transfer to another current verified member. |
| PUT `/bands/:bandId/default-lineup` | `expectedVersion,assignments:[{slotId,userId}]` | `{band}`; every template slot once, distinct eligible members. |
| DELETE `/bands/:bandId/default-lineup` | `expectedVersion` | `{band}`. |

All writes require current leader except band creation. Band/custom names and
slot labels: trimmed 1–50. Templates/lineups require 1–50 slots, including empties;
repeated instruments are allowed. New members need at least one eligible
instrument; later eligibility may be cleared. Existing issued unchanged
assignments survive eligibility changes. Snapshot slots never change with the
template. Applying a default is local frontend work; every eventual save still
validates eligibility/IDs. Custom names are case-insensitively unique per band.

## Event and poll routes

Event fields are `name,type,date,startTime,endTime,timezone,location,description?`.
Type is `rehearsal|performance`; name 1–100, location 1–255, description nullable
up to 2000. Date is a real `YYYY-MM-DD`, times `HH:mm`, timezone UTC or supported
IANA name. End must follow start on the same day; new/changed schedules must be
future. DST gaps fail; overlaps choose the earlier occurrence. Returned
`startsAt,endsAt` are canonical UTC instants.

Write slots use `{slotId?,clientKey?,templateSlotId?,instrumentId,label,userId}`:
existing ID or new UUID clientKey, explicit nullable userId. Array order is
position; omitted slots in a supplied collection retire them. Omitted collection
on PATCH preserves it. Foreign IDs and duplicate users fail. Snapshot provenance
`templateSlotId` is nullable and immutable for an existing slot.

| Method/path | Input | Success data |
| --- | --- | --- |
| POST `/bands/:bandId/events` | Event fields + `templateVersion,hideFromUninvited,slots` | 201 `{event}`. |
| GET `/bands/:bandId/events` | None | `{events}`; visible upcoming ascending, past descending, stable ID tie break. |
| GET `/bands/:bandId/events/:eventId` | None | `{event}`. |
| PATCH `/bands/:bandId/events/:eventId` | `expectedVersion` + optional event fields, `hideFromUninvited,slots` | `{event}`. |
| DELETE `/bands/:bandId/events/:eventId` | `expectedVersion` | `{message:'Event deleted'}`. |
| PUT `/bands/:bandId/events/:eventId/invitations/:invitationId/response` | `expectedVersion,status,declineReason?` | `{event}`; own current invitation, `accepted|declined`. |
| POST `/bands/:bandId/polls` | `templateVersion,name,location,description?,timezone,hideFromUninvited,slots,options` | 201 `{poll}`. |
| GET `/bands/:bandId/polls` | None | `{polls}` summaries. |
| GET `/bands/:bandId/polls/:pollId` | None | `{poll}`. |
| PATCH `/bands/:bandId/polls/:pollId` | `expectedVersion` + optional poll fields, slots/options | `{poll}`. |
| PUT `/bands/:bandId/polls/:pollId/availability` | `expectedVersion,expectedVoteVersion,answers:[{optionId,optionRevision,answer}]` | `{poll}`; complete own row, answer `yes|no`. |
| POST `/bands/:bandId/polls/:pollId/finalize` | `expectedVersion,optionId,optionRevision` | `{poll,event}`; exactly one fresh rehearsal. |
| POST `/bands/:bandId/polls/:pollId/cancel` | `expectedVersion` | `{poll}`. |

Events contain existing event identity/details/timestamps plus `version,
hideFromUninvited,startsAt,endsAt,slots,myInvitationId,canManage,canRespond`.
Read slot is `{slotId,templateSlotId,instrumentId,instrumentName,label,position,
invitation}`; invitation is null or `{invitationId,userId,username,firstName,
lastName,status,respondedAt,declineReason?}`. Private declineReason appears only
for its owner/current leader. New/replaced invitations start Pending with fresh
IDs. Responses are allowed strictly before stored start. Repeat response is a
no-op; changed reason alone sends no response-status mail. Accept clears reason.
Time or resolved-instant changes reset Accepted to Pending, preserving Declined.
Representation-only timezone aliases preserve responses. Past deletion is allowed
without cancellation mail; edits/responses return `EVENT_STARTED` at exact start.

Datebook has no new endpoint. Combine visible cross-band event lists, select
future own Pending/Accepted invitations, sort `startsAt,bandId,eventId`. Membership
alone creates no datebook entry; leaders must also be assigned. Hidden resources
are visible only to current leader/current invitees (including Declined event
invitees). List/direct enforce identical rules, and former members lose access.

Poll detail is `{pollId,bandId,version,name,location,description,timezone,state,
hideFromUninvited,slots,options,responses,finalizedEventId,createdAt,updatedAt,
canManage,canVote}`. Poll slot replaces event invitation with nullable
`musician:{userId,username,firstName,lastName}`. List summaries contain
`pollId,name,state,hideFromUninvited,finalizedEventId,updatedAt`.

Poll write options are `{optionId?,clientKey?,date,startTime,endTime}`, existing
ID or new UUID; reads add `revision,startsAt,endsAt`. Require 1–30 distinct ranges
and at least one selected musician on creation. Retained elapsed options remain
readable/open; changed/new ranges must be future. Responses are
`{userId,voteVersion,answers:[{optionId,optionRevision,answer}],needsResponse}`;
absent row is version zero with empty answers, never inferred No. Only current
option revisions are returned. Changed options invalidate affected answers;
removal/re-add of a musician starts a new assignment generation. Different
respondents can save independently. Finalization accepts No/missing answers,
requires a current invitee and future option, creates fresh Pending invitations.
Finalized/cancelled snapshots remain viewable and read-only (`POLL_CLOSED`).

## Delivery and runtime settings

Domain success means saved/queued, never guaranteed inbox delivery. Durable
transactional effects use six preference categories; account security bypasses
them. Queued leader mail resolves the current owner before first attempt. Frozen
retries reuse recipient/content/provider key even across restarts. Retry schedule
is bounded within 23 hours; uncertain sends beyond it become `delivery_unknown`
without blind resend. Resend acceptance is `sent`, not mailbox confirmation.

Set `RESEND_API_KEY`, `EMAIL_FROM` and a stable base64 32-byte
`OUTBOX_ENCRYPTION_KEY` together. `CLIENT_ORIGIN` is the trusted application link
origin; never derive token links from Host. Raw temporary tokens exist only in
encrypted outbox payloads, cleared at terminal delivery/expiry. Without mail
settings dispatch is disabled and security issuance fails `MAIL_UNAVAILABLE`.
See [runtime settings](../../runtime-configuration.md) and
[outbox recovery](../../db/notifications.md). This work provisions no infrastructure.

`GET /health` returns `{data:{status:'ok'}}` or 503
`{error:{code:'DATABASE_UNAVAILABLE',message:'Database is unavailable'}}`.
No session is created by the exact probe. No pagination, datebook aggregation
endpoint, migration/backfill, UI notification dashboard or delivery-status API
is introduced.
