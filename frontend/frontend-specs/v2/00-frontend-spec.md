# bandOS v2 — Frontend implementation specification

Status: Specification review complete; aligned with the approved shared contract. Frontend v2 implementation has not started; backend foundations BE-V2-01 and BE-V2-02 have merged. See the [backend implementation status](../../../backend/backend-specs/v2/01-backend-spec.md#implementation-status).
Updated: 19 November 2026.

## 1. Purpose, authority, and boundaries

Deliver the workflows in the [global v2 spec](../../../artifacts/feature-planning/v2/v2-spec.md) against the single [shared frontend/backend contract](../../../backend/backend-specs/v2/00-shared-contract.md) and its [backend implementation spec](../../../backend/backend-specs/v2/01-backend-spec.md). Shared sections 2–10 are binding for requests, models, permissions, state changes, errors and email effects. Shared section 12 records confirmed decisions; the user approved all remaining product and technical defaults on 19 November 2026. Use those approved values.

Extend the existing React/Vite JavaScript/JSX application, React Router, TanStack Query, credentialed API client, session boundary, band workspace, event forms, and responsive navigation. Retain the established visual language, plain validation approach, explicit Save/Cancel, loading/error recovery, unsaved-change protection, and accessibility patterns. No frontend rewrite, new global state framework, full calendar, live updates, notification center, infrastructure work, or implementation tickets are included.

The existing [master frontend plan](../00-frontend-implementation-plan.md) remains the v1 baseline. This spec supersedes its exclusions only for agreed v2 functionality. Preserve current browser-timezone initialization on event creation and explicit timezone editing; older plan language about never defaulting timezone was superseded by the implemented v1 refinement.

## 2. Route and access map

Keep the existing shell, desktop band navigation, mobile drawer, account menu and band-specific roles. Full-access routes require active verified session. Deep links from emails pass through the same guards and backend checks as ordinary navigation.

| Route | Audience / responsibility |
| --- | --- |
| `/`, `/bands/:bandId` | Personal invitation datebook / visible band schedule; retain existing URLs. |
| `/bands/new` | Verified account; create band with instrumentation, no required musician assignments. |
| `/bands/:bandId/members` | Members view roster/eligible instruments; current leader adds/removes members and edits instruments. |
| `/bands/:bandId/settings` | Existing settings plus instrumentation/default lineup/ownership transfer; management leader-only. |
| `/bands/:bandId/events/new` | Leader; event details and unsent local lineup, one save. |
| `/bands/:bandId/events/:eventId` | Authorized viewer; full issued lineup/statuses; own response controls before start. |
| `/bands/:bandId/events/:eventId/edit` | Leader, future event; details/lineup/visibility, one save. |
| `/bands/:bandId/polls/new` | Leader; rehearsal lineup/options; save invites selected musicians. |
| `/bands/:bandId/polls/:pollId` | Authorized viewer; saved grid, own explicit availability save, leader composition/finalize/cancel controls. |
| `/bands/:bandId/polls/:pollId/edit` | Leader, open poll; options/lineup/visibility editing. |
| `/account` | Profile, active/pending email, password, notification preferences and deactivation. |
| `/login`, `/register` | Existing entry flows with verification and recovery support. |
| `/verify-email`, `/verify-email-change` | Token confirmation form or verification instructions/resend; signed-out/restricted users must reach these. |
| `/forgot-password`, `/reset-password` | Email request / token-and-new-password form; usable without full session. |

Protected destinations must be same-application relative paths validated by the existing destination helper; do not preserve token query strings or external URLs as return destinations. A signed-in restricted account lands on verification instructions, never the main shell. Recovery and token routes must not be rejected by a generic signed-out-only guard. Following registration verification, continue directly only when the server returns a full session for the original valid matching registration session; otherwise show login. Email-change confirmation signs out all devices, including the confirming session, and requires fresh login with the new active address. Do not infer authentication from successful token confirmation alone.

## 3. State ownership and API boundary

Server owns membership/role/eligibility, catalog/template/default, issued invitation identity/status, visibility, poll options/revisions/votes/closure, preferences, account verification and session validity. Forms own unsaved field values and selections in React state. Never publish local lineup choices to shared query cache or browser storage. A Pending invitation exists only after successful server save. No autosave, persisted unsent draft endpoint, or separate Send update operation.

Keep current credentialed API client; normalize current-user snake_case fields once at its boundary. Normalize new event/poll/preference models according to the shared contract, retaining IDs, versions, UTC instants, original local fields, option revisions, and conditional private fields. Render permissions from current responses, with backend as authority. Do not derive global leadership from a user's role in another band.

Mutation intent rules:

1. Capture loaded aggregate/row versions and stable existing IDs. New form rows use UUID client keys.
2. On deliberate submit, validate locally, create one idempotency key, and retain the exact body/key until outcome is known. Prevent double clicks while pending.
3. If the response is uncertain, offer retry using that same body/key. Do not rebuild it from newer form values or invent a new key. A separate changed intent requires a fresh key.
4. On success replace authoritative detail cache with returned representation, invalidate affected lists/datebook/band/default/poll queries, and clear draft only after acknowledging success. Never optimistically expose unsent assignments.
5. On stale version, keep the local draft only in memory and offer explicit reload/discard. Do not merge or retry automatically; explain that reloading replaces unsaved changes. This recovery was confirmed on 19 November 2026. Independent poll row saves and vote-only changes do not themselves invalidate a leader's composition form. On access loss, clear inaccessible data rather than continuing to show privileged draft content.

Disable background polling and live synchronization. Other users' poll answers update on load or explicit Refresh. Do not overwrite a dirty grid/form with refetch results. Retain normal safe reads where appropriate, but background/bootstrap/focus/reconnect requests omit the activity header; explicit successful navigation/Refresh requests send `X-bandos-activity: user`. No heartbeat or passive page timer extends a session. Abort/ignore in-flight protected requests when session identity changes.

## 4. Instrumentation, members, and defaults

### Band creation and catalog

Extend Create Band with a keyboard-operable list of at least one slot. Each row has an instrument select and editable label; repeated instruments are allowed. Add/remove buttons are sufficient; drag-and-drop is not required. Fetch the approved starter choices in shared section 4 via `GET /instruments`; repeated Guitar slots may suggest Guitar 1/Guitar 2, but submitted labels remain explicit. Name stays 1–50 characters; shared slot count/label bounds apply. Band instrumentation, event and poll lineup editors must explain and enforce the confirmed 50-slot maximum, including empty slots; prevent adding a 51st slot. Musician selection is not required. Optional leader instruments can be set now or edited later from Members.

A successful `POST /bands` creates the band/template together and opens its workspace. Creation also permits entering a custom instrument name in a slot; submit `instrumentName` instead of `instrumentId` for that new-band choice. Repeated names create one shared band instrument atomically. After creation, custom instruments use the separate catalog endpoint. Existing bands have an instrumentation editor in Settings. Explain that changes affect future event/poll starting templates and default applicability; existing snapshots remain unchanged. Use band version on save, stable IDs for retained slots, and explicit removal confirmation where it would invalidate a default.

In member/default/event/poll selectors, show instrument names from the band catalog. An inline Add custom instrument control opens a small named form, calls the catalog endpoint, then selects the returned choice. Catalog creation is a separate saved configuration action; cancelling the outer form does not remove a successfully created instrument. Explain that persistence in the success feedback. Duplicate names reuse the server's existing choice.

### Membership and ownership

Retain adding an existing account by username and keep the add form available after success. Add multi-select eligibility from the band's catalog, requiring at least one instrument on initial addition. The leader may later edit any member's eligible instruments, including their own, or clear eligibility. Explain that existing event assignments remain while future eligibility/default applicability changes. Do not expose other account email addresses.

Remove Member confirmation names the musician and explains upcoming invitation/open poll removal and ended band access. Do not expose a checkbox to suppress removal emails. After successful removal, refresh roster, band/default, event and poll queries/datebook; do not imply email preferences can preserve assignments. Backend rejection leaves roster unchanged.

Ownership transfer is in leader Settings: choose another current eligible account from roster, explicitly confirm management transfer, send versioned request. After success the old leader remains a member; immediately remove management controls, invalidate role-dependent queries and navigate to an allowed band page. Assignment/invitation states do not change. Do not offer self-removal of the current owner; direct them to transfer/delete first.

### Optional default lineup

Show one musician select per template slot, filtered to eligible current members and excluding users selected elsewhere. Empty state says no default is saved; event creation remains available. Saving a default requires all slots filled once. Provide a Clear default action. Display server `isApplicable` and invalid reasons; render an incomplete/ineligible default as repairable with missing/unavailable choices clearly identified.

Apply default lineup appears only in event/poll lineup forms, is explicitly chosen, and is disabled with an explanation if no valid default exists. It copies assignments into local form state by source template slot ID, leaves extra custom slots empty, and does not send anything. Confirm before overwriting existing local selections. Never use the previous event as a fallback. Revalidate loaded eligibility/default on save and handle stale membership without silently replacing musicians.

## 5. Event form, lineup, and response flows

### Create/edit and send

Retain existing name/type/date/start/end/timezone/location/description controls and validation; add visibility toggle and slot/lineup editor. Initial create form copies the band's current template with all musicians empty. Type remains Rehearsal or Performance. Allow event-only add/remove slots without changing band configuration. Each select offers eligible current members, excludes a musician used in another slot, and shows empty as a valid choice. The leader can select themselves only when eligible. Maintain existing issued grandfathered assignments when eligibility later changes; label them clearly rather than forcing replacement on an unrelated detail edit.

All lineup editing stays private in the leader's form. Preparing a replacement neither removes the old musician nor publishes a Pending replacement. Preserve old issued identity until successful save. Highlight actual pending changes in the form so removal/replacement consequences are reviewable. On edit, keep persisted slot IDs for retained rows; new slots use client keys. Use immutable invitation IDs for responses.

Primary save copy should communicate the action, e.g. **Save and send invitations** on creation or **Save changes** with nearby explanation that invitations/updates are sent on save. There is no save-draft/send-later workflow. Empty slots are allowed, but at least one slot must remain. One request saves details and selected lineup together; failure must not be presented as a partially sent lineup. Cancel discards only local edits and respects the existing unsaved-change guard.

Time editing feedback explains that changing date/start/end or changing timezone in a way that shifts scheduled instants requires accepted musicians to confirm again. Location and non-time edits retain answers. Use returned UTC instants for ordering and closure, retain event-local fields for display. Preserve browser timezone initialization on create, explicit control on edit and same-day limits. Reject nonexistent DST times and use the earlier occurrence during overlaps. A timezone-label-only edit preserving local fields and both resolved instants preserves responses while sending the normal event-detail update. Surface server errors for a passed start or nonexistent local time without losing editable fields.

### Event detail and invitation response

Show full issued lineup/statuses for authorized viewers with text labels Pending, Accepted and Declined; do not rely on color. Empty slots remain visible. Every viewer can see statuses; only leader or response owner receives/sees that invitation's private decline reason. Ordinary members cannot edit other people's response or lineup. Do not render management controls for nonleaders.

If the viewer owns a current issued invitation and the event has not started, show Accept/Decline and optional decline reason on decline. Explain and enforce the confirmed 1,000-character maximum; preserve the draft and show a field error for oversized input rather than silently truncating it. Preselect saved response where applicable, support changing Accepted ↔ Declined, and keep Declined users able to respond via detail until removed/replaced. Accept clears the reason. Response Save submits the invitation ID and loaded event version; only update UI after success. A repeated unchanged status causes no extra email. A leader has response controls only if assigned; leadership never means Accepted.

At start, locally move detail to read-only for response/detail/lineup editing and refetch when appropriate. Server rejection remains authoritative if the browser clock differs. Past events retain lineup/status history. The leader may delete past events, including in-progress events, without sending cancellation emails. The deletion confirmation explains this behavior.

### Visibility and deletion

Visibility wording: **Hide from uninvited band members**. Default off. Explain that leader and issued invitees, including Declined, can still see the full lineup. This setting does not add anyone to a datebook or send an invitation. A hidden resource direct link denied by API uses unavailable recovery without leaking its title/lineup.

Band deletion confirmation must explain that upcoming events and open rehearsal polls will be cancelled, with cancellation emails subject to the normal recipient rules and each musician's preferences. Successful deletion clears the band and its events/polls from protected caches and the datebook.

Upcoming deletion confirmation explains that Pending/Accepted invitees receive cancellation according to their own preferences; Declined do not. Removing a particular issued assignment sends removal according to that user's preferences, including Declined. The leader has no per-action email-suppression control. Success removes event or affected datebook entries through cache invalidation; email delivery failure is not shown as a failed save.

## 6. Personal datebook and band schedule

Retain existing personal agenda, next-event emphasis, upcoming/past band schedules, event links, chronology and responsive navigation. Change datebook inclusion to **own issued Pending/Accepted invitations only**, not band membership. Compute across per-band event queries using returned `startsAt`, with shared tie-break ordering. Polls never enter the datebook before finalization.

Pending and Accepted must have distinct textual states in both datebook rows and event detail. Decline removes a datebook item immediately after successful response; acceptance restores it. Membership removal, invitation retirement and cancellation also remove entries on next authoritative load or successful local mutation invalidation. Empty copy explains that there are no upcoming invitations; leaders can still create/manage unassigned events through the band schedule.

Preserve partial-failure behavior: successful bands' results remain visible with a contextual message and retry for failed bands. Do not represent a failed band as having no invitations. Revoked membership clears inaccessible band data. A missing/hidden event route does not redirect into a cached event view.

Add a distinct Rehearsal polls section to the band schedule with Open and Closed views or equivalent clear grouping. A poll row shows name and state, never a confirmed event date. Authorized uninvited members may open visible polls read-only. Finalized poll shows its linked rehearsal; the actual scheduled rehearsal appears in chronological events and invited musicians' datebooks separately. Cancelled polls remain closed/read-only. No event-type enum expansion is required for polls.

## 7. Rehearsal poll creation, grid, and closure

### Leader composition

Poll creation collects name, location, optional description, poll timezone, instrument slots/lineup, visibility and proposed date/start/end ranges. Start with band template and no selected musicians, optionally Apply default. Require one or more proposed options, at most 30 (confirmed on 19 November 2026), and at least one selected musician to invite; require at least one slot and apply the other shared limits and schedule validation. Explain the option maximum and prevent adding a 31st option on creation or edit. **Create poll and invite musicians** makes this send action clear. Do not create a scheduled rehearsal or datebook entry at this stage.

The leader may add/remove/replace invited musicians and options while open. Existing rows show saved answers; added users start unanswered for every current option. Removing a poll musician explains vote exclusion and removal notification without suggesting they leave the band. Band removal revokes access entirely; poll-only removal still allows ordinary visible-to-band read access. Never transfer old answers to a replacement.

Option editor keeps stable IDs/revisions, indicates which changed/new options need fresh answers, and explains that unchanged options retain votes. Deleting an option removes that active answer column and triggers a poll-update email to retained invitees. New or changed options must be future; unchanged elapsed options may remain on an open poll. A timezone-label-only change preserving local fields and instants preserves answers; reject DST gaps and use the earlier overlap occurrence as in the shared resolver. One save sends one poll update per retained invitee, new-invite emails only to added users, and removals only to removed users. Metadata/visibility-only changes do not invent an extra notification category. Poll timezone changes use the shared semantic option rules.

### Voting and saved state

Display proposed options as columns and invited musicians as rows in a semantic table/grid. Include original date, time range and poll timezone in accessible column headings. Use a straightforward stable display-name/user-ID ordering, with no rank/hierarchy. Every authorized viewer can see all saved answers and unanswered cells. Only the viewer's own current invited row is editable, including the leader only if assigned.

Each current option requires Yes or No before Save availability is enabled. Missing remains visually and semantically Unanswered, not No; no Maybe. Draft cell changes stay local and do not replace the displayed saved answers for other users. Save submits all current option IDs/revisions and the loaded poll and own row versions. A successful save refreshes authoritative saved state and gives one concise confirmation. One changed row save may email the leader once; repeated unchanged save does not.

Use explicit Refresh to see others' later answers. If local edits exist, confirm discard before refresh or navigation. New/changed server options encountered on save produce stale-version recovery; reload latest, then answer every current option. Do not silently submit a partial set against old options. Preserve unchanged saved votes in the server result and identify remaining unanswered options.

On narrow screens allow horizontal scrolling inside the grid with visible row labels and a clear scroll affordance. Keep the page/document scroll intact, controls reachable, headers associated, and Yes/No choices labelled with musician and option. Avoid drag-only editing and color-only answers. A mobile single-row editor may complement the table but must retain access to other saved rows.

### Finalize/cancel/read-only

The leader can select any **future** proposed option regardless of No/missing votes. Confirmation names the chosen local date/time/timezone and explains that everyone in the current invited lineup receives a fresh Pending rehearsal invitation requiring separate acceptance. Show vote summaries to inform, never block finalization based on availability. Disable duplicate submission, use the idempotency key, and use returned linked event after success.

A finalized poll stays read-only with saved closing answers and a link to its rehearsal. Changes to that rehearsal use standard event editing/reconfirmation; no reopen control. An equivalent finalization retry must navigate to the existing rehearsal. If another manager action changed/closed the poll, refresh rather than creating a second event.

Cancel poll confirmation explains closure and preference-controlled cancellation mail to current invitees. Closed polls do not permit answers, composition edits or finalization. Open polls whose options all passed stay visible and open with a leader prompt to add future options or cancel; elapsed time alone never closes them (confirmed on 19 November 2026). If removals leave no invited musicians, show the empty lineup clearly, disable finalization with an explanation, and prompt the leader to add a musician or cancel. The poll remains open. If concurrent removal causes the server to reject finalization, refresh the lineup and show the same recovery without claiming a rehearsal was created.

## 8. Account, security, and preference flows

### Registration and verification

Registration applies the same approved new-password validation as change/reset: at least eight characters and at most 72 UTF-8 bytes, without trimming or silent truncation. Successful registration uses structured `{data:{user,session}}` and shows verification instructions with the account email, resend action, cooldown feedback and logout/recovery links. Main protected pages are inaccessible until verified. Login with an unverified account returns the same restricted state, not an unexplained login failure.

Verification link route captures its token in memory, removes query token via history replacement, and requires a Confirm email action. GET navigation never consumes a token. On success, use the returned user/session: with full access, update the session boundary, refresh protected queries and continue to the safe non-token return destination or datebook; with null user/session, show a login link and preserve only that safe destination. Missing, expired or different-account registration sessions must not be treated as authenticated by token success, and an unrelated signed-in account must not be silently switched. Invalid/expired/used links show one recoverable message and resend path without exposing account existence. After successful resend, explain that only the newest link works; rejected/rate-limited requests leave the current link valid. Do not persist token state in browser storage or send it to analytics; set no-referrer on token pages. Reload after stripping a token can require reopening the email link.

### Forgot/reset/change password

Add Forgot password to Login. Request form accepts email and always displays the server's generic confirmation; do not infer account existence from it. Honor cooldown/Retry-After. After a successful replacement request, explain that only the newest reset link works. Reset link route shows new password plus confirmation with accessible visibility controls and shared validation (minimum 8 characters, maximum 72 UTF-8 bytes while bcrypt remains). Confirmation is client-local and not sent as an extra unsupported JSON field. Submit token/new password explicitly.

Successful reset clears any session/cache and routes to Login with **Password reset. Log in again.** It must not auto-login or imply account verification. Expired/invalid/reused tokens offer a new request. Logged-in password change requires current password, new password and confirmation; success clears session/cache and requires login on this device, explaining all devices were signed out. Wrong current password is a field error, not forced logout. Never persist password inputs/drafts across navigation or reload.

### Email change

Account shows active email and pending proposed email separately. Change form requires current password and new address; submit the dedicated endpoint, never profile PATCH. Explain that the active address stays in use until verification, a verification goes to the new address and a security notice to the old. Pending state offers resend and replacement request with current password. Confirmation route uses the same explicit token handling; success signs out all devices, including the confirming session; clear the affected account's protected session/cache and require login using the new active address. Explain that all devices were signed out. Conflict or expired-token recovery leaves the old active address unchanged.

### Notification preferences

Account has one master switch plus six labelled categories corresponding exactly to shared section 7. Load current preferences and save explicitly with version; all defaults come from server. Master off visually disables category editing or clearly marks categories inactive while preserving their saved selections. Explain that verification, recovery and email security messages still send. Preferences are user-wide across bands and do not affect invitations, responses, datebook entries, permissions or reconfirmation. No in-app inbox, badge or notification center is added.

### Deactivation and session expiry

Retain current-password deactivation and clear confirmation. Explain that deactivation removes current memberships, upcoming event assignments and open-poll participation, while preserving historical records (confirmed on 19 November 2026). If server returns blocking owned bands, list those bands with Settings links for ownership transfer/deletion; never auto-delete a band to make deactivation succeed. After successful deactivation clear all protected state and show signed-out confirmation. Other members' historical records remain unaffected by the UI cleanup.

Session restoration uses `/users/me` session access and server deadlines. UI may explain idle/absolute expiration but cannot enforce it by itself. Any protected request returning `AUTHENTICATION_REQUIRED` clears protected cache, closes response/edit controls and sends user to Login with safe destination and clear session-ended message. Avoid replaying unsaved mutations after login. Token/password forms do not survive session changes. Distinguish invalid login/current-password errors from true expiration. No timer/background read keeps passive pages signed in.

## 9. Feedback, accessibility, and failure handling

Use existing contextual field errors, page error recovery, query pending states, confirmations and restrained success feedback. Each new route covers loading, usable empty state, invalid input, denied/missing resource, network failure and success. Settings/preferences changes keep previous saved state until success. A returned domain success is not reversed because email sending later fails; avoid copy claiming every recipient received mail.

Preserve document scrolling and mobile drawer focus behavior. Forms have explicit labels, meaningful legends, keyboard actions, visible focus, error associations and a focused error summary. Slot removal/custom-instrument/ownership/finalize dialogs restore focus. Status and availability text are available without color. Saving states prevent duplicate actions and announce completion without excessive repeated live regions.

Permission or membership errors clear now-inaccessible data and provide a safe band/datebook link; never show protected content behind an error overlay. `STALE_VERSION` is a recoverable conflict with explicit reload, not an automatic retry. Show pending local replacements separately from authoritative issued status so a failed save cannot mislead the leader about who was invited.

## 10. Acceptance and focused verification

All shared `V2-01` through `V2-14` acceptance scenarios apply, with UI assertions paired to exact shared requests. Backend authorization is separately tested; frontend tests do not substitute for it.

Use the existing component/integration test setup for a small set of risk-focused flows:

- Create band with repeated slots; select shared custom instruments; reject duplicates; save/repair/apply default locally without invitation calls.
- Stage replacement/incomplete lineup, cancel without effects, save once with exact IDs/version/key, and handle stale/network-uncertain outcomes without losing identity or double issuance.
- Own invitation response, private reason rendering, status/datebook inclusion, time-reset feedback and past read-only behavior; visible/hidden direct-link recovery and role changes.
- Membership removal/transfer/deactivation blockers and relevant cache clearing.
- Poll own-row all-option validation, explicit save, option-revision stale handling, independent rows, removed invitee state, blocked empty-poll finalization, explicit refresh and terminal finalization/cancellation.
- Every preference field/master preservation and account-message explanation; no product-state changes on opt-out.
- Restricted registration/login, direct continuation with the valid original matching registration session, login fallback for missing/expired/mismatched sessions, token confirmation/recovery errors, pending email/current-password behavior, global session reset, 401 versus field-error handling and safe destinations.
- Cross-band partial datebook failure and actual-instant ordering, loading/empty/error recovery, and prevention of background session renewal.

During implementation run relevant existing frontend tests, lint and production build, and any backend integration checks affected by shared contract changes. Manually smoke the core leader/musician flows at desktop and narrow widths with keyboard and screen-reader labels, including horizontal poll navigation, unsaved edits and expired-session submission. Record actual results then; this planning document claims no passing runtime tests.

## 11. Dependencies and approved decisions

Backend delivery must provide the shared endpoints, conditional private-field serialization, versions/idempotency, canonical instants, option revisions, session metadata and generic errors. Frontend must not imitate missing APIs with local persisted invitations or pretend email dispatch succeeded. Mocks used during implementation must follow the shared contract exactly.

All shared section 12 defaults are approved, including catalog/limits, IP/submission throttles, password byte limit, timezone semantics, past-option poll behavior, default mapping and lifecycle cascades. Display server rate-limit responses rather than independently counting or inventing limits in the client. No outstanding approval questions remain for this scope; ticket creation and implementation require a subsequent request. Normal component decomposition remains an implementation choice; drag-and-drop is optional future exploration, not an acceptance requirement.

No tickets, sequencing backlog, application code, database changes, deployment changes or PR are created by these specifications.
