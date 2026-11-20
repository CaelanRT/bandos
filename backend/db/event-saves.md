# Event saves (BE-V2-10)

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
Invitation response and time-change reconfirmation transitions remain BE-V2-11;
full read/cancellation lifecycle coverage remains BE-V2-12.
