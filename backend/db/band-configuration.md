# Band configuration runtime (BE-V2-08–09)

All paths use `/api/v1`, cookie authentication and an active verified account.
Band details are available to current members; writes below require the current
leader. Mutation bodies reject unknown keys. Send a UUID `Idempotency-Key` and
`expectedVersion` equal to the current `band.version`. Successful retries replay
before version validation, with current access rechecked. Semantic changes bump
band version; normalized no-ops do not.

| Endpoint | Body in addition to expectedVersion | Response data |
| --- | --- | --- |
| POST `/bands/:bandId/members` | `username`, nonempty unique `instrumentIds` | `member, band` (201) |
| PATCH `/bands/:bandId/members/:userId` | unique `instrumentIds` (may be empty) | `member, band` |
| PUT `/bands/:bandId/default-lineup` | `assignments: [{slotId,userId}]` | `band` |
| DELETE `/bands/:bandId/default-lineup` | None | `band` (200) |

Member addition resolves usernames ignoring case and requires an existing active
verified account (`USER_NOT_FOUND` otherwise). Existing membership returns
`409 MEMBER_ALREADY_EXISTS`. Instruments must belong to the band. Eligibility
edits may clear any current member's list, including the leader's.

A saved default must assign every current template slot exactly once, with each
musician once and currently eligible. Foreign/duplicate slots, duplicate musicians
and incomplete assignments return `400 VALIDATION_ERROR`; unavailable or ineligible
musicians return `409 DEFAULT_LINEUP_INVALID`. Stale writes return
`409 STALE_VERSION`, ordinary members receive `403 LEADER_REQUIRED`, and outsiders
receive `404 BAND_NOT_FOUND`. Invalid or stale writes have no domain effects.

`GET /bands/:bandId` includes catalog, ordered instrumentation, members with
`instrumentIds`, and `defaultLineup: null` or
`{version, assignments, isApplicable, invalidReasons}`. The default version
identifies the saved revision; changes to eligibility/template applicability do
not increment it. Equivalent assignment-array reorderings are no-ops.
Reads recalculate applicability using these reason codes:

- `MISSING_SLOT` with `slotId`: a new template slot lacks an assignment.
- `MEMBER_UNAVAILABLE` with `slotId,userId`: the saved musician is no longer a
  current active band member.
- `INSTRUMENT_INELIGIBLE` with `slotId,userId`: current eligibility lacks the
  slot's instrument.

Removed template slots drop out of the saved assignments; surviving mappings
remain repairable. Clearing an already absent default succeeds without a version
increment. Eligibility and default edits preserve issued event assignments and
snapshots and send no invitations or email. Applying a default is a local frontend
action; BE-V2-10 owns validation of subsequent new/moved event assignments.
