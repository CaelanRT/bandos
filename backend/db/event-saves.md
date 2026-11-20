# Event saves and responses (BE-V2-10–11)

`POST /api/v1/bands/:bandId/events` and
`PATCH /api/v1/bands/:bandId/events/:eventId` require a verified cookie session,
current band leadership, an allowed browser Origin and a UUID `Idempotency-Key`.
Creation takes `templateVersion` equal to the loaded `band.version`, all event
fields, `hideFromUninvited` and `slots`. PATCH takes `expectedVersion` equal to
`event.version` and the changed fields. Retries with the same key/body replay the
committed response before checking versions, after rechecking current access.

A lineup contains 1–50 ordered slots, including empty ones. Each write slot has
`{slotId?,clientKey?,templateSlotId?,instrumentId,label,userId}`. Use the persisted
`slotId` for an existing slot and a UUID `clientKey` for a new slot, exclusively.
Missing `userId` is invalid; `null` means empty. Supplied `slots` replaces the
collection; omitted PATCH `slots` leaves it untouched. Instruments and template
provenance must belong to this band; existing provenance is immutable. Errors use
`slots.<index>.<field>` paths. Responses include persisted slot IDs.

New assignments require active current members eligible for the selected
instrument, with each musician at most once. The same slot/user/instrument keeps
its invitation ID and response even after eligibility is cleared. Moving a
musician, replacing them or changing their instrument retires the old invitation
and issues a fresh Pending invitation. Retired rows and response history remain
stored. Snapshot names/labels and event-local slot order are independent of later
band template edits. No default is applied implicitly.

Event changes, invitation retirement/issuance, recipient-specific outbox effects
and the replay record commit together. Removals include Declined invitations.
Detail updates notify retained Pending/Accepted invitees; removed/replaced users
receive their removal/invitation effects instead. Slot order/label edits alone
send no email. Normalized no-ops preserve version and send nothing. Delivery uses
the existing preference-aware dispatcher; API success does not promise delivery.

Resolved UTC `startsAt`/`endsAt` use the existing same-day/DST resolver. At or after
the stored start, edits fail `409 EVENT_STARTED` before considering a proposed
future schedule. Invalid, stale, unauthorized and failed transactions have no
invitation or mail effects.

Event projections include ordered saved slots, current invitations, own invitation
ID and permission flags. Private decline reasons appear only for the current
leader or that invitation's owner. Hidden events require leadership or a current
invitation as well as current membership, including for list/direct access.

`PUT /api/v1/bands/:bandId/events/:eventId/invitations/:invitationId/response`
takes `{expectedVersion,status:'accepted'|'declined',declineReason?:string|null}`
and returns `{data:{event}}`. Only the active current invitation owner can
respond, including an explicitly assigned leader. Retired/foreign invitations
are unavailable. The session, membership, event, invitation, version and stored
start boundary are checked under the shared mutation locks. Identical responses
preserve the event version/history and send no mail; actual changes increment
the event version. Status changes record `response` history and one
`invitationResponses` effect addressed to the current leader at dispatch time.
Reason-only edits record `reason_changed` without mail or changing `respondedAt`.
Decline reasons normalize omitted/null/blank to null and trim before enforcing
1,000 characters; non-null reasons on acceptance are rejected. Acceptance clears
the prior reason. Private reasons are excluded from mail payloads. Response retries recheck current
leadership and filter the committed projection so former leaders cannot retrieve
other musicians’ reasons from a stored replay.

Schedule saves compare local date/start/end and both resolved instants. Any change
resets only retained Accepted invitations to Pending, clears `respondedAt`, and
records `reconfirmation` history with the saving leader as actor. Pending and
Declined stay unchanged. A timezone representation edit preserving local fields
and instants retains all responses but sends ordinary detail updates. Reconfirmation
sends no musician-response effect. Combined lineup/detail saves send updates only
to retained Pending/Accepted invitees, removals to retired invitees, and invitations
to newly assigned users. All writes, history, mail effects and replay commit
atomically; failed/stale/expired-session writes have no effects.

Full read/cancellation lifecycle coverage remains BE-V2-12.
