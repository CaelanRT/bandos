# bandOS v2 — Shared frontend/backend contract

Status: Specification review complete; shared contract and defaults approved. Backend tickets BE-V2-01–17 are completed; BE-V2-18 integrated verification is For Review ([Draft PR #110](https://github.com/CaelanRT/bandos/pull/110)). See the [current runtime API reference](02-runtime-api.md).
Updated: 22 November 2026.

## 1. Authority and reading order

The [global v2 specification](../../../artifacts/feature-planning/v2/v2-spec.md) defines product scope. This document defines the single shared wire contract used by the [backend specification](01-backend-spec.md) and [frontend specification](../../../frontend/frontend-specs/v2/00-frontend-spec.md). Read all three together. See the [backend implementation status](01-backend-spec.md#implementation-status) and [ticket sequence](tickets/00-ticket-sequence.md) for delivered behavior.

The [existing API contract](../v1/00-api-contract.md) describes v1 runtime behavior. Its unchanged endpoints, validation, transport, and envelopes remain the baseline; changes explicitly specified here supersede them for the planned v2 implementation only. Do not rewrite that runtime reference as if v2 already exists. Retain `/api/v1` as the API prefix: product version and URL version are distinct. Coordinated frontend/backend delivery and a fresh development database are permitted; migration, backfill, and a v1 compatibility layer are unnecessary.

All detailed decisions in section 12 are confirmed. On 19 November 2026 the user approved all remaining proposed defaults, including technical details. Both implementation specifications follow this approved contract. The global spec wins any accidental conflict. The backend backlog and implementation progress are recorded separately; this contract continues to define the full target.

## 2. Transport, validation, errors, and concurrency

Use credentialed JSON requests and the existing PostgreSQL-backed `bandos.sid` cookie. Keep production HTTPS, HttpOnly, SameSite=Lax, Secure in production, and exact configured client-origin CORS. Validate same-origin/configured-client Origin on browser mutations, including auth endpoints; reject unexpected origins with `403 ORIGIN_NOT_ALLOWED`. Do not put session credentials in browser storage.

Success responses use `{ "data": { ... } }`. Normalize registration/login to this envelope as described in section 9. Deletions return `200 {data:{message}}`, not an assumed 204. All IDs are positive safe-integer JSON numbers; route IDs follow the existing strict decimal format. Instants use UTC ISO 8601 strings. Version fields are positive integers, except an absent poll vote row starts at version zero. Unknown JSON keys are rejected on changed/new endpoints. Preserve existing field bounds unless changed below. Trim names and text; never trim passwords. Return structured validation errors, including malformed JSON, without database/provider details.

```json
{"error":{"code":"VALIDATION_ERROR","message":"Invalid request body","details":[{"field":"slots.1.userId","message":"Musician already occupies another slot"}]}}
```

| HTTP | Code | Client behavior |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Keep draft; map dotted field paths to inputs; focus error summary. |
| 401 | `AUTHENTICATION_REQUIRED` | Clear protected cache and require login. Optional `error.reason`: `idle_expired`, `absolute_expired`, `revoked`; generic fallback if session record is gone. |
| 401 | `INVALID_CREDENTIALS` | Login/deactivation credential failure; do not interpret every 401 as session expiry. |
| 403 | `EMAIL_VERIFICATION_REQUIRED` | Route restricted session to verification screen. |
| 403 | `LEADER_REQUIRED` | Refresh current permissions; remove management controls. |
| 403 | `CURRENT_PASSWORD_INCORRECT` | Keep authenticated account form; field error. |
| 404 | `BAND_NOT_FOUND`, `EVENT_NOT_FOUND`, `POLL_NOT_FOUND`, `INVITATION_NOT_FOUND` | Unavailable recovery; never reveal hidden/deleted resources or cross-band IDs. |
| 409 | `STALE_VERSION` | Reload latest representation explicitly; never auto-resubmit a stale whole form. |
| 409 | `EVENT_STARTED`, `POLL_CLOSED` | Refresh and render read-only state. |
| 409 | `DEFAULT_LINEUP_INVALID`, `LEADERSHIP_TRANSFER_REQUIRED`, `ACCOUNT_CONFLICT`, `MEMBER_ALREADY_EXISTS` | Contextual repair; retain valid form inputs. |
| 409 | `IDEMPOTENCY_KEY_REUSED`, `REQUEST_IN_PROGRESS` | Correct client key use, or retry same request later. |
| 400 | `TOKEN_INVALID_OR_EXPIRED` | Same message for missing, expired, revoked, already-used, or wrong-purpose token. |
| 429 | `TOO_MANY_ATTEMPTS` | Honor `Retry-After` seconds; show retry timing. |
| 500/503 | `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` | Recoverable failure; do not claim save succeeded. |

All aggregate edits/deletions take `expectedVersion` in JSON. Band configuration/membership/ownership uses `band.version`; event mutations and responses use `event.version`; poll composition/options/lifecycle use `poll.version`. Successful semantic changes increment the affected aggregate version. No-op writes create neither version increments nor emails. A response uses both the current event version and its `invitationId`. Poll votes additionally use `expectedVoteVersion`, scoped to that musician, so two different musicians can save independently. Vote saves do not increment poll composition version or invalidate the leader's composition form. Stale requests change nothing and enqueue nothing. Confirmed stale-edit recovery requires explicit reload with a warning that unsaved edits will be discarded; never merge or resubmit automatically.

Require `Idempotency-Key` (client UUID) for creates, event saves/responses/deletion, membership removal, ownership transfer, band deletion, poll mutations/finalization, and account state mutations. Retry an uncertain request with the same key and identical body; a newly edited intent gets a new key. Server scopes records to actor, method, path and key, stores a canonical request hash, and replays the committed status/body without new effects. A changed body with the same key returns `IDEMPOTENCY_KEY_REUSED`. Authenticate and recheck access before replay; never replay a now-inaccessible representation. Check replay before stale-version validation. Retain records for seven days; aggregate uniqueness/version and terminal-state constraints still prevent duplicate finalization or invitation effects after expiry. No automatic mutation retry with a new key.

## 3. Permissions and domain invariants

All application resources require an active, verified account and current band membership. A restricted unverified session can use only account identification, verification/resend, recovery, and logout. A leader is the band's one current owner, not a global role.

| Capability | Current leader | Current invited member | Other current member | Former member |
| --- | --- | --- | --- | --- |
| View visible-to-band event/poll | Yes | Yes | Yes | No |
| View hidden event/poll | Yes | Yes, including Declined event invitee | No | No |
| View lineup/statuses/saved poll answers | Yes | If resource visible | If resource visible | No |
| View a decline reason | Yes | Own reason only | No | No |
| Manage band, lineup, poll, ownership | Yes | No | No | No |
| Respond to issued event invitation | Only if assigned | Own active invitation before start | No | No |
| Save poll availability | Only if assigned, while open | Own invited row while open | No | No |

List endpoints apply the same visibility filtering as direct requests. Return not-found for a hidden resource, even when guessed correctly. Membership loss overrides historical invitation visibility. A removed poll invitee who still belongs to the band may view only under ordinary uninvited-member visibility. Historical membership does not grant access.

Instrument slots have stable IDs, order, an `instrumentId`, and a display `label` (e.g. Guitar 1). Duplicate instrument IDs are permitted across slots. Each current lineup has at most one assignment per slot and one slot per user. New assignments require active current membership and instrument eligibility. An unchanged issued assignment survives later eligibility removal; moving it to another slot or instrument is a new assignment and must validate current eligibility. Past records retain musician/instrument labels and statuses.

## 4. Bands, catalog, eligibility, and defaults

Band detail retains its existing fields and adds:

```text
version: integer
instruments: [{instrumentId, name}]
instrumentation: [{slotId, instrumentId, label, position}]
members: [existing member fields + instrumentIds: number[]]
defaultLineup: null | {
  version, assignments: [{slotId, userId}],
  isApplicable: boolean,
  invalidReasons: [{code, slotId?, userId?}]
}
```

Default invalid-reason codes: `MISSING_SLOT`, `MEMBER_UNAVAILABLE`, `INSTRUMENT_INELIGIBLE`. Duplicate assignments are rejected at save, not stored as a valid default. `defaultLineup.version` identifies saved assignments; `band.version` protects writes. Reads recompute applicability against current membership, eligibility, and template slots. Adding a template slot leaves the old default incomplete; removed template slots drop out of its mapping. Existing event and poll snapshots never change with the template.

| Method/path (relative to `/api/v1`) | Request | Result |
| --- | --- | --- |
| POST `/bands` | `{name, instrumentation:[{instrumentId,label}], leaderInstrumentIds?:number[]}` | `201 {data:{band}}`; creates leader/catalog/template atomically. Instrument IDs come from starter catalog; creation-time custom choices use `{instrumentName,label}` in place of `{instrumentId,label}` and are created in the new band atomically. |
| GET `/instruments` | None; verified account | `200 {data:{instruments}}`; starter choices available before band creation. |
| POST `/bands/:bandId/instruments` | `{name,expectedVersion}` | `201 {data:{instrument,band}}`; band-wide custom instrument. |
| PATCH `/bands/:bandId/instrumentation` | `{expectedVersion,slots:[{slotId?,instrumentId,label}]}` | `{data:{band}}`; omitted slots removed, new slots assigned IDs. Array order becomes position. |
| POST `/bands/:bandId/members` | `{username,instrumentIds,expectedVersion}` | `201 {data:{member,band}}`; existing active verified account only. |
| PATCH `/bands/:bandId/members/:userId` | `{instrumentIds,expectedVersion}` | `{data:{member,band}}`; eligibility only, including leader's own eligibility. |
| PUT `/bands/:bandId/default-lineup` | `{expectedVersion,assignments:[{slotId,userId}]}` | `{data:{band}}`; every current template slot exactly once. |
| DELETE `/bands/:bandId/default-lineup` | `{expectedVersion}` | `{data:{band}}`; optional default cleared. |
| DELETE `/bands/:bandId/members/:userId` | `{expectedVersion}` | `{data:{band}}`; future assignments/open poll rows removed atomically; cannot remove owner. |
| POST `/bands/:bandId/ownership` | `{userId,expectedVersion}` | `{data:{band}}`; target is another active current verified member. |

Existing band list/detail/rename/delete routes remain. Rename and deletion take `expectedVersion`; creation now requires instrumentation. Band name stays 1–50 characters. Member eligibility on addition has at least one instrument; a later edit may clear it to prevent future assignment. Custom instrument names are trimmed 1–50 characters, unique ignoring case within a band. A duplicate custom-name request returns the existing instrument without creating a duplicate. The starter catalog is Vocals, Guitar, Bass, Drums, Keyboards, Piano, Percussion, Saxophone, Trumpet, Trombone, Violin, and Cello. Starter instruments are copied/referenced into each band's catalog with stable IDs. Catalog deletion/renaming is not required in v2. Band creation accepts either a starter `instrumentId` or a custom `instrumentName` per slot, never both; repeated normalized custom names resolve to one new band instrument. This permits custom-only instrumentation at creation. Subsequent custom additions use the catalog endpoint.

## 5. Scheduled events and responses

Event detail retains existing fields and adds:

```text
version, startsAt, endsAt,
hideFromUninvited: boolean,
slots: [{slotId, templateSlotId: number|null, instrumentId, instrumentName,
         label, position, invitation: null|{
           invitationId,userId,username,firstName,lastName,
           status:'pending'|'accepted'|'declined',respondedAt:instant|null,
           declineReason?:string|null
         }}],
myInvitationId: number|null,
canManage: boolean, canRespond: boolean
```

`declineReason` is omitted entirely except for leader or that invitation's owner. Flags are presentation hints; every write reauthorizes. No unsent assignments are returned by the API. Nullable `invitation` means a genuinely empty saved slot.

Event write slot shape: `{slotId?,clientKey?,templateSlotId?,instrumentId,label,userId:number|null}`. Existing slots use `slotId`; new slots use a client UUID `clientKey` for validation correlation and retry, not a persisted unsent assignment. Array order determines position. `templateSlotId` is the original band slot link, nullable for event-specific slots; backend validates band ownership and never uses it to bypass eligibility. Responses include persisted slot IDs. Missing `userId` is invalid; explicit null empties a slot. An omitted existing slot is removed when `slots` is supplied. Omitted `slots` on PATCH leaves all assignments untouched. For an existing slot `templateSlotId` is immutable; changing its instrument with an assigned user creates a replacement invitation.

| Method/path | Request | Result |
| --- | --- | --- |
| POST `/bands/:bandId/events` | Existing event fields + `{templateVersion,hideFromUninvited,slots}` | `201 {data:{event}}`; `templateVersion` is the loaded band version. All non-null selections become Pending invitations in this transaction. |
| PATCH `/bands/:bandId/events/:eventId` | `{expectedVersion,...changedEventFields,hideFromUninvited?,slots?}` | `{data:{event}}`; save and send updates/invitations together. |
| DELETE `/bands/:bandId/events/:eventId` | `{expectedVersion}` | `{data:{message}}`; soft delete/cancel. |
| PUT `/bands/:bandId/events/:eventId/invitations/:invitationId/response` | `{expectedVersion,status:'accepted'|'declined',declineReason?:string|null}` | `{data:{event}}`; current invitation owner only. No client transition to Pending. |
| GET `/bands/:bandId/events` | Existing query behavior | `{data:{events}}`; visibility-filtered event representations, including own invitation identity/status. |
| GET `/bands/:bandId/events/:eventId` | None | `{data:{event}}`; authorized representation. |

Event creation begins with the band template copied to local form state and no musicians selected. Applying a valid saved default is a local explicit action, never a send endpoint. Map by `templateSlotId`; leave extra event-only slots empty and omit removed template slots. Confirm before replacing local selections. The server still validates every assignment at save. Loading a default does not reserve users or guarantee a later save will succeed.

| Transition | Atomic result |
| --- | --- |
| Empty slot → selected musician on save | New Pending invitation; datebook entry; invitation email. |
| Issued slot → same musician/instrument/slot | Retain invitation ID and response, except time-reset rule. |
| Replace/remove issued assignment | Retire old invitation, remove datebook entry; removal email even if Declined; replacement gets new ID/Pending and invitation email. |
| Pending → Accepted/Declined; Accepted ↔ Declined | Record actual change; current leader gets one response email; Declined leaves datebook immediately, Accepted returns. |
| Repeat identical response | No change, no email. Accept clears any previous decline reason. A changed decline reason alone updates private data without a response-status email. |
| Save date/time change | Existing Accepted → Pending, Pending stays Pending, Declined stays Declined. Newly assigned users get invitation only. |
| Save non-time details | Preserve statuses. Update email only to retained Pending/Accepted users. |
| Cancel upcoming event | Remove all datebook entries/access; cancellation email only to Pending/Accepted users. |

Allow response and lineup/details edits only while server time is strictly before the stored start. At or after start, return `EVENT_STARTED` even if the proposed new time is future. Past-event deletion remains available to the leader as in v1, with no cancellation email. Upcoming means `startsAt > now`; past includes in-progress events. A leader is never automatically invited or accepted.

Time contract: retain `date` (real `YYYY-MM-DD`), `startTime`/`endTime` (`HH:mm`), and event-local IANA `timezone` (or UTC); require same-day end after start and future start on create/edit. Use the existing resolver: reject nonexistent daylight-saving times and choose the earlier occurrence during overlaps. Store resolved UTC start/end instants and return `startsAt`/`endsAt`; never sort via database timezone conversion that could disagree with that resolver. Reset Accepted responses if **any local date/start/end field changes OR either resolved instant changes**. Changing only a timezone label/alias while local fields and both instants remain identical is representation-only: preserve statuses, but send normal detail-update email. Changing timezone with unchanged local fields but shifted instants resets responses. Changing end time alone also requires reconfirmation.

Datebook retains the existing cross-band read pattern: frontend combines filtered event lists, includes only its own Pending/Accepted issued invitations and future events, sorts by `startsAt`, then `bandId`, then `eventId`. No new datebook endpoint is required. Declined events remain reachable via visible band schedule/detail and email links for response changes.

## 6. Rehearsal polls

Polls are separate from scheduled events until finalization; never supply a fake confirmed date or datebook entry.

```text
Poll = {
 pollId,bandId,version,name,location,description,timezone,
 state:'open'|'finalized'|'cancelled',hideFromUninvited,
 slots:[{slotId,templateSlotId,instrumentId,instrumentName,label,position,
         musician:null|{userId,username,firstName,lastName}}],
 options:[{optionId,revision,date,startTime,endTime,startsAt,endsAt}],
 responses:[{userId,voteVersion,answers:[{optionId,optionRevision,answer:'yes'|'no'}],
             needsResponse:boolean}],
 finalizedEventId:number|null,createdAt,updatedAt,canManage,canVote
}
```

Poll options share one explicit poll timezone and the same schedule resolver/field validation as events. There is no invitation accept/decline state for a poll. An invited musician with no saved answers has `voteVersion:0`, `answers:[]`, `needsResponse:true`; missing answers are never interpreted as No. Returned answers include only current option revisions. Removed users are excluded from the active roster and aggregates. Finalized/cancelled polls retain their closing snapshot for authorized viewing.

| Method/path | Request | Result |
| --- | --- | --- |
| POST `/bands/:bandId/polls` | `{templateVersion,name,location,description?,timezone,hideFromUninvited,slots,options:[{clientKey,date,startTime,endTime}]}` | `201 {data:{poll}}`; invite all selected users. Slots use event write shape. |
| GET `/bands/:bandId/polls` | None | `{data:{polls}}`; authorized summaries: `pollId,name,state,hideFromUninvited,finalizedEventId,updatedAt`. |
| GET `/bands/:bandId/polls/:pollId` | None | `{data:{poll}}`. |
| PATCH `/bands/:bandId/polls/:pollId` | `{expectedVersion,name?,location?,description?,timezone?,hideFromUninvited?,slots?,options?:[{optionId?,clientKey?,date,startTime,endTime}]}` | `{data:{poll}}`; open only. Supplied arrays replace those collections. |
| PUT `/bands/:bandId/polls/:pollId/availability` | `{expectedVersion,expectedVoteVersion,answers:[{optionId,optionRevision,answer}]}` | `{data:{poll}}`; complete current-option set, actor's own row. |
| POST `/bands/:bandId/polls/:pollId/finalize` | `{expectedVersion,optionId,optionRevision}` | `{data:{poll,event}}`; one scheduled rehearsal, all current invited musicians Pending. |
| POST `/bands/:bandId/polls/:pollId/cancel` | `{expectedVersion}` | `{data:{poll}}`; terminal cancellation. |

At least one selected musician is required to create a poll; subsequent removals may leave zero invitees. Finalization requires at least one currently invited musician. If none remain, return `400 VALIDATION_ERROR` with `details[].field` set to `slots`, leave the poll open, and create no event, invitations, or emails. The leader must add a musician or cancel the poll. Only open polls can change composition/options or receive votes. Any proposed future option may be selected despite missing/No answers; a now-past option cannot create a future rehearsal and must be replaced before finalization. Open polls do not automatically close as options pass. Unchanged past options may remain on reads/lineup edits; newly created or changed options must be future.

Stable option IDs and revisions determine vote preservation: changing a date/time or its resolved instants increments that option's revision and invalidates its answers; adding creates an unanswered option; removing drops it and its active answers; unchanged/reordered options retain answers. A timezone-only representation edit preserving local fields and instants preserves answers. Existing users must submit every current option on their next save; untouched valid answers remain visible meanwhile. Replacing a musician retires their row and adds a blank new row, even if that musician later returns. New invitees answer all current options. Removing/replacing users sends removals and new invitations; it never transfers votes.

Finalization locks poll composition, requires at least one currently invited musician, validates the chosen option and active lineup, copies slots/details/visibility into a new `rehearsal` event, creates fresh Pending invitations, queues event invitation emails, and marks poll finalized with a unique `finalizedEventId` in one transaction. Poll Yes never becomes Accepted. A finalized poll cannot reopen; subsequent edits occur on the linked event. A repeat finalization with the same option returns the existing linked event without new effects; a different option returns `POLL_CLOSED`. Visibility of each resource is checked independently when following the link.

## 7. Email preferences and trigger contract

`GET /users/me/notification-preferences` and `PUT /users/me/notification-preferences` return `{data:{preferences}}`. PUT takes `{expectedVersion,...allBooleanFields}`. The preference object contains `version`, `enabled`, `invitations`, `eventUpdates`, `removalsAndCancellations`, `invitationResponses`, `pollUpdates`, `pollResponses`. All booleans default true; switching `enabled` off preserves category choices. Preferences are account-wide. Security messages bypass these switches.

| Category key | Trigger / recipients |
| --- | --- |
| `invitations` | New scheduled invitation or poll invitation → newly assigned musician. Finalization always creates new event invitations. |
| `eventUpdates` | Semantic saved event detail changes → retained Pending/Accepted invitees. Includes reconfirmation; excludes Declined and removed/replaced invitees. |
| `removalsAndCancellations` | Retired issued event invitation (including Declined), removed open-poll invitee, band/member lifecycle removal → affected musician. Upcoming event cancellation → Pending/Accepted. Open poll cancellation → all current invitees. |
| `invitationResponses` | Initial or changed event response status → current leader. |
| `pollUpdates` | Added/changed/deleted proposed options or meaningful poll timezone change → retained current poll invitees. |
| `pollResponses` | One saved row with any changed availability → current leader, one summary per save. |

No email for unsaved drafts, repeated identical saves, mere lineup label/order edits, or other musicians' responses to ordinary members. On a save combining option changes and new poll invitees, new invitees receive invitation only; removed musicians receive removal only. A detail update plus event reassignment similarly gives each recipient their applicable invitation/removal instead of an extra update. If the same user is both removed and newly assigned, removal and invitation are distinct effects. A leader responding/voting to their own assignment receives the normal leader-directed email subject to their preferences. There is no in-app notification subsystem.

Notification records are committed with domain changes; API success means saved/queued, never guaranteed mailbox delivery. Resend failures do not roll back the domain action. Stable notification IDs and provider idempotency keys deduplicate retries; backend section 5 specifies bounded retries and uncertain-delivery recovery. Email links are authenticated routes and never grant access by possession. Evaluate current master/category preferences immediately before initial dispatch; suppressed records are terminal and do not send retroactively on opt-in. Freeze recipients/payload on the first provider attempt for identical retries. Recheck current leader before first dispatch of leader-directed emails, so transfer redirects still-queued notices; accepted provider requests cannot be recalled.

## 8. Membership, ownership, and account lifecycle

Membership removal is one atomic operation: remove current membership, retire all issued assignments on upcoming events (all statuses), retire open-poll assignments/answers, invalidate default applicability, and enqueue applicable removal messages. Historical event/finalized-poll records remain; former members have no access. Time boundaries are evaluated once using transaction server time. Template slots remain, now empty where affected.

Ownership transfer updates the sole owner and both roles atomically. The old leader remains a member, with eligibility and assignments unchanged. Concurrent old-leader mutations recheck current ownership under the same band lock and fail after transfer. Cannot remove the leader via member removal.

Deactivation still requires current password. If the account leads any active band, return `409 LEADERSHIP_TRANSFER_REQUIRED` and `details` identifying only their own blocking bands. The client provides links to transfer/delete them, then retries. Otherwise deactivate, remove current memberships with the above future/poll effects, revoke all sessions/tokens, and preserve historical records. Band deletion closes its upcoming events/open polls and queues equivalent cancellations before access disappears; past records remain stored. Band-deletion cancellation and deactivation membership/assignment/poll-removal behavior were confirmed on 19 November 2026; past-event deletion without cancellation email is also confirmed in section 12.

## 9. Account and authentication API

Retain registration/login fields and profile validation limits from v1. Existing current-user fields remain snake_case at the wire boundary; add `email_verified_at:instant|null`, `pending_email:string|null`, and `version`. Frontend normalizes once. Never expose password hashes or token values in user objects.

| Method/path | Request | Success |
| --- | --- | --- |
| POST `/auth/register` | Existing registration fields | `201 {data:{user,session}}`; restricted unverified session; verification queued. |
| POST `/auth/login` | `{email,password}` | `200 {data:{user,session}}`; verified full session or unverified restricted session. |
| GET `/users/me` | Existing session | `{data:{user,session}}`; allowed for restricted session. |
| POST `/auth/verification/resend` | `{email}` | `202 {data:{message}}`; generic account-independent confirmation. |
| POST `/auth/verification/confirm` | `{token}` | `{data:{message,user,session}}`; consumes registration-verification token; matching valid registration session becomes full access, otherwise `user` and `session` are null and login is required. |
| POST `/auth/password/forgot` | `{email}` | `202 {data:{message}}`; identical for unknown/inactive/known accounts. |
| POST `/auth/password/reset` | `{token,newPassword}` | `{data:{message}}`; consumes reset token, revokes all sessions; no login. |
| POST `/users/me/password` | `{expectedVersion,currentPassword,newPassword}` | `{data:{message}}`; revokes all sessions including caller; clear cookie. |
| POST `/users/me/email-change` | `{expectedVersion,currentPassword,newEmail}` | `202 {data:{user}}`; old email remains active; verification to new, security notice to old. |
| POST `/users/me/email-change/resend` | `{}` | `202 {data:{message}}`; requires full session; current pending address only. |
| POST `/auth/email-change/confirm` | `{token}` | `{data:{message}}`; atomically swap verified address, revoke all sessions on all devices including the confirming session; login again with the new active address. |
| PATCH `/users/me` | `{expectedVersion,username?,firstName?,lastName?}` | `{data:{user}}`; nonempty validated subset; email/password changes cannot use this route. |
| DELETE `/users/me` | `{expectedVersion,password}` | `{data:{message}}`; leadership check, deactivate/revoke. |

Logout remains session-optional and idempotent. Registration verification resend never resends a pending email-change token; that uses its separate authenticated endpoint. Issuing a replacement pending address invalidates the former pending token. Conflicting target email is `409 ACCOUNT_CONFLICT`; recheck uniqueness at confirmation. Password reset does not implicitly verify an unverified account. Successful registration verification continues directly only when the requesting browser has the original, still-valid registration session for the token account. Record registration origin in server session state to distinguish it from a later restricted login. Regenerate that session ID, grant full access and preserve its original authentication instant/seven-day absolute deadline; successful confirmation counts as user activity within that deadline. Revoke other restricted sessions for the verified account. With no matching valid registration session, mark the email verified but return null user/session and require login; token possession alone never creates a session or switches a different signed-in account. Return authoritative user/session on continuation so the frontend need not infer access.

Token links use application routes `/verify-email?token=...`, `/reset-password?token=...`, `/verify-email-change?token=...`. GET never consumes tokens; explicit form POST does. Frontend removes token from the address bar after capturing it in memory, sets a no-referrer policy, and sends it only in the intended POST. Do not persist tokens or include them in telemetry. Security messages are separate from notification categories.

`session` is `{access:'full'|'verification_required',authenticatedAt,idleExpiresAt,absoluteExpiresAt}`. Both expiries are server instants; UI timers are advisory. Inactivity is 24 hours; absolute expiry is seven days after authentication. Explicit successful user-driven navigation/load/refresh uses `X-bandos-activity: user`; accepted authenticated mutations also count. Background/bootstrap/focus/reconnect reads and failed requests do not count; never send heartbeat requests. The server checks deadlines **before** renewing activity, limits renewal to absolute expiry, and rechecks before committing a mutation. A request begun after either deadline cannot mutate. Passive open pages cannot extend sessions. Password change/reset, confirmed email-address change, and deactivation revoke sessions on every device, including the initiating/confirming session. After an email-address change, login requires the new active address; this behavior was confirmed on 19 November 2026.

## 10. Shared validation additions

- Slot label: trimmed 1–50 characters. Position derives from array order. Instruments, slots, users, options, and invitations must belong to the indicated band/resource. Reject duplicate IDs and contradictory identifiers.
- Band template: at least one slot. Band template, event and poll lineups each have a confirmed maximum of 50 slots, including empty slots. Event and poll lineups each require at least one slot. Default: complete mapping with unique eligible current musicians.
- Poll: 1–30 distinct proposed ranges; same limits for name/location/description as events; at least one selected musician at creation. Same-day ranges only. Duplicate resolved start/end options are invalid.
- Decline reason: optional nullable trimmed text, maximum 1,000 characters; blank becomes null. Only accepted/declined status values are writable. Reject non-null reason on acceptance.
- New passwords: existing minimum 8 characters, with maximum 72 UTF-8 bytes while bcrypt is retained; never silently truncate. Login accepts existing credential input without trimming. Use the same rule in registration/change/reset UI and server. This approved byte bound supersedes the existing character-based maximum for new passwords.
- Reset/new-email token lifetimes and throttles are defined once in backend section 6; frontend displays server deadlines and `Retry-After`, not independently invented durations.

## 11. Cross-stack acceptance scenarios

These are shared behavior checks, not implementation tickets. Backend tests verify durable transitions and permissions; frontend tests verify interaction, state, and exact requests.

| ID | Scenario / observable outcome |
| --- | --- |
| V2-01 | Serve the approved starter catalog; create repeated instrument slots; enforce 1–50 slots and initial member eligibility while permitting later clearing; add multi-instrument musicians and a shared custom instrument; reject foreign-band/duplicate-user assignments. |
| V2-02 | Complete optional default saves; Apply is explicit and sends nothing; incomplete/ineligible/former-member defaults cannot apply; template edits preserve event snapshots; Apply maps surviving template slots, leaves event-only slots empty and confirms replacement of local selections. |
| V2-03 | Partial local lineup remains private; one save issues Pending invitations; replacement takes effect only on save and gets a fresh ID/status. |
| V2-04 | Pending/Accepted future invites appear in datebook; Declined disappears but can respond again via band/detail; leader must be invited and accept. |
| V2-05 | Hidden/direct/list access, other users' decline reasons, cross-band IDs, ordinary-member writes, and removed membership are enforced by API. |
| V2-06 | Status changes and no-ops produce correct leader emails; time/end/timezone changes reset Accepted correctly; location edits preserve status; Declined excluded from updates/cancellation. Start boundary closes edits/responses; past deletion sends no cancellation email. Reject DST gaps and resolve overlaps to the earlier occurrence; representation-only timezone edits preserve responses. |
| V2-07 | Membership removal clears future assignments/open votes and access, retains history, invalidates default; transfer moves management and queued leader recipients; leader deactivation blocked. |
| V2-08 | Poll permits only own complete Yes/No row; draft saves explicit; added/changed options invalidate only affected answers; adding/removing/replacing musicians preserves other rows and sends correct email. Enforce 1–30 options, future-only new/changed options, retained elapsed options, deleted-option updates and no new metadata-only email category. |
| V2-09 | Reject empty-poll finalization without side effects and leave it open. With at least one invitee, finalize any future option despite No/missing answers; one rehearsal with fresh Pending invitations; repeats/concurrency never duplicate; closed polls stay read-only. Cancellation notifies only current invitees. |
| V2-10 | All six preference categories and master switch gate emails only; account messages bypass opt-outs. Provider failure preserves domain save; retry never repeats invitation/response/finalization. Durable outbox checks preferences before first dispatch, uses stable provider keys and stops blind retries of uncertain sends beyond the deduplication window. |
| V2-11 | Registration verification continues with the original valid matching session and preserves its absolute deadline; absent/expired/mismatched sessions require login without account switching. Registration gate, current-password checks, pending email swap, generic recovery, token expiry/reuse, and all-device password revocation work; reset never signs in or silently verifies. Enforce new-password character/UTF-8-byte bounds, approved address/IP/submission limits, hashed purpose-bound tokens and encrypted temporary token delivery payloads. |
| V2-12 | Independently exercise 24-hour idle and seven-day absolute expiry, background activity, server boundary races, safe login return, and expired-session writes. |
| V2-13 | Stale event, membership, poll option, and own-row edits fail without side effects; separate respondents save independently; uncertain network retry replays one committed action, with seven-day replay-record retention and terminal-state protection afterward. |
| V2-14 | Responsive/keyboard flows cover loading, no data, partial datebook failure, permissions lost, token failure, validation, and explicit refresh. |

## 12. Confirmed decision register

The global scope is preserved. All entries below are confirmed. Previously confirmed decisions remain approved; the user approved all remaining product and technical defaults together on 19 November 2026. No outstanding approval questions remain for this scope.

| Topic | Confirmed decision |
| --- | --- |
| Starter catalog — confirmed 19 November 2026 | Vocals, Guitar, Bass, Drums, Keyboards, Piano, Percussion, Saxophone, Trumpet, Trombone, Violin, Cello. Band-wide custom names cover others; no catalog administration UI. |
| Poll option maximum — confirmed 19 November 2026 | Each rehearsal poll allows at most 30 proposed date/time options. |
| Instrument slot maximum — confirmed 19 November 2026 | Band instrumentation, each event lineup, and each poll lineup allow at most 50 instrument slots, including empty slots. |
| Private decline reason — confirmed 19 November 2026 | Optional, at most 1,000 characters; visible only to its author and the band leader. |
| Other limits — confirmed 19 November 2026 | Minimum one event/poll slot; minimum one poll option; member-add requires at least one eligible instrument, later clearing allowed. |
| Stale-edit recovery — confirmed 19 November 2026 | Reject saves when relevant loaded state is stale; preserve newer server data and ask for explicit reload, warning that it discards unsaved edits. No automatic merge/resubmission. Independent poll rows remain independently writable; vote-only saves do not invalidate poll composition edits. |
| Concurrency implementation — confirmed 19 November 2026 | Explicit aggregate versions, independent row versions, seven-day API idempotency retention. |
| Registration verification continuation — confirmed 19 November 2026 | Continue directly with the original valid registration session belonging to the verified account; otherwise require login. Verification alone never creates a session. |
| Email-change confirmation — confirmed 19 November 2026 | Revoke all sessions on all devices, including the confirming session, and require login with the new active email address. |
| Verification-link expiry — confirmed 19 November 2026 | Registration and email-address-change verification links expire 24 hours after issuance; users can request a replacement after expiry. |
| Password-reset link expiry — confirmed 19 November 2026 | Password-reset links expire 30 minutes after issuance; users can request a new link after expiry. |
| Per-address email request limits — confirmed 19 November 2026 | Verification and password-reset email requests share a 60-second cooldown and a maximum of five requests per hour per normalized email address, with account-independent responses. |
| Replacement links — confirmed 19 November 2026 | Successfully issuing a replacement verification/reset link invalidates earlier unused links for the same account and purpose. Only the newest works; rejected/rate-limited requests leave the current link valid. |
| Security details — confirmed 19 November 2026 | Backend section 6 defines the approved additional IP/submission throttles, hashed token storage, and bcrypt byte bound; section 5 defines encrypted temporary outbox token payloads. |
| End-time edits — confirmed 19 November 2026 | Changing date, start time, or end time resets Accepted invitations to Pending and requires reconfirmation. Existing Pending invitations remain Pending; Declined invitations remain Declined. |
| Timezone edits — confirmed 19 November 2026 | Timezone-only changes preserve responses only when local fields and instants are unchanged; retain earlier-overlap resolver. |
| Empty-poll finalization — confirmed 19 November 2026 | At least one currently invited musician is required to finalize. An empty poll remains open; the leader must add a musician or cancel it. |
| Polls with elapsed options — confirmed 19 November 2026 | Keep the poll open when all proposed times pass; prompt the leader to add future options or cancel. No automatic closure from elapsed time. |
| Other poll edge cases — confirmed 19 November 2026 | Future-only new/changed options; deleted options notify; metadata-only edits have no new notification category. |
| Default application — confirmed 19 November 2026 | Map surviving template slot identities into event form; extra event-only slots remain empty; replacement of local selections requires confirmation. |
| Band deletion — confirmed 19 November 2026 | Cancel upcoming events and open polls, sending cancellation emails according to normal recipient eligibility and each recipient's preferences. |
| Account deactivation — confirmed 19 November 2026 | After leadership obligations are resolved, deactivate and remove current memberships, upcoming event assignments and open-poll participation/votes while preserving past and closed-poll records. |
| Past-event deletion — confirmed 19 November 2026 | Retain leader deletion of past events without cancellation email. |
| Delivery — confirmed 19 November 2026 | Durable application outbox, bounded provider retries, no blind retry beyond provider deduplication window; preference check before first dispatch. |

Do not add recurring/overnight events, guest musicians, multiple assignments per musician, Maybe answers, live updates, in-app notifications, deployment work, or migration work. No acceptance tests or runtime checks are claimed by writing these specifications.
