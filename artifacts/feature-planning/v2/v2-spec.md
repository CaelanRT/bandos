# bandOS v2 — Global Product Specification

Status: Specification review complete; product behavior and proposed defaults approved. Backend foundations BE-V2-01 and BE-V2-02 are completed; remaining backend and frontend v2 work is planned.

Updated: 19 November 2026.

**Review status:** All remaining product and technical defaults were approved on 19 November 2026. The [approved defaults](#approved-defaults) are retained below as the decision record. No outstanding approval questions remain for this specification scope.

Sources: [v1 functionality baseline](../v1/v1-implemented-state.md), [v2 feature dump](brainstorming/featuretextdump.md), and the product decisions made during the planning interview.

Implementation progress: [backend status and merged PR evidence](../../../backend/backend-specs/v2/01-backend-spec.md#implementation-status). [BE-V2-03](../../../backend/backend-specs/v2/tickets/03-mutation-concurrency.md) is the next backend ticket. The complete product behavior below is the approved target, not a claim of full delivery.

## 1. Purpose and delivery boundaries

V2 expands bandOS from shared band scheduling into event-specific musician coordination. Leaders define their band's instrumentation, select lineups, invite musicians, collect responses, and schedule rehearsals through availability polls. Users control notification emails and gain account verification, account recovery, and bounded sessions.

This document defines shared product behavior. The [shared contract](../../../backend/backend-specs/v2/00-shared-contract.md), [frontend specification](../../../frontend/frontend-specs/v2/00-frontend-spec.md), and [backend specification](../../../backend/backend-specs/v2/01-backend-spec.md) define the aligned implementation requirements, including permissions, state transitions, validation, notification triggers, and failure behavior.

- Retain the working account, multi-band membership, scheduling, responsive navigation, and recovery behavior unless this specification changes it.
- The application is already containerized and deployed. Infrastructure, containerization, and deployment work are outside this effort.
- Development data is disposable. A fresh database is acceptable; no v1 data migration, backfill, or compatibility layer is required. This is a planning decision, not an instruction to delete a database now.
- Preserve the established React, Express, PostgreSQL, and cookie-session foundation unless implementation exposes a concrete need for a separately agreed change.

## 2. Shared vocabulary and permissions

| Term | Meaning |
| --- | --- |
| Band member | A current member of a band; the band can include multiple musicians who play the same instrument. |
| Leader | The band's sole owner and administrator. Leadership is specific to each band. |
| Instrument catalog | The instruments available for selection in a band, including custom instruments. |
| Instrumentation | A collection of instrument slots, such as Guitar 1, Guitar 2, Bass, and Drums. |
| Lineup | The assignment of musicians to an event's instrument slots. |
| Default lineup | An optional, complete set of musician assignments saved for the band's instrumentation. |
| Unsent assignment | A leader's uncommitted lineup selection in the form. It is not a Pending invitation; saving commits the selection and sends the invitation. |
| Invitation | An event assignment sent to a musician, with a Pending, Accepted, or Declined response. |
| Rehearsal poll | A rehearsal planning stage with proposed date/time options and invited musicians' availability answers. |

Leaders manage band configuration, membership, instrumentation, default lineups, event lineups, invitations, and polls. Members view permitted information and submit their own responses. Being able to view another member's response does not grant permission to edit it. All permissions and visibility rules must be enforced by the backend as well as reflected in the frontend.

## 3. Bands, instruments, and default lineups

### Band creation and instrumentation

- Band creation requires the leader to define instrumentation with at least one instrument slot. Assigning musicians is not required during creation.
- Multiple slots may use the same instrument.
- The starter catalog is Vocals, Guitar, Bass, Drums, Keyboards, Piano, Percussion, Saxophone, Trumpet, Trombone, Violin, and Cello. Band-wide custom instruments cover others; no catalog administration UI is required.
- Band instrumentation, each event lineup, and each rehearsal poll lineup allow a maximum of 50 instrument slots, including empty slots. Confirmed during specification review on 19 November 2026.
- Slots have no required/optional flag. Leaders add or remove slots to match an event's needs.
- The leader may edit the band's instrumentation later. Existing event instrumentation and lineups remain unchanged; future events start from the updated instrumentation.

### Members and instrument eligibility

- Adding a member continues to use an existing bandOS account; a musician must belong to the band before receiving an event or poll invitation.
- When adding a member, the leader selects the instruments that member plays from a provided list and can add a custom instrument.
- Custom instruments become available throughout that band, rather than belonging only to the member who first used them.
- A member can have multiple eligible instruments. Only the leader can edit this list.
- Adding a member requires at least one eligible instrument; later eligibility edits may clear the list.
- A musician may play different instruments at different events, but may occupy only one slot within an individual event or default lineup.
- A leader can assign a musician only to an instrument on that musician's band instrument list.
- Removing an instrument from a musician's profile preserves their existing event assignments. The updated eligibility applies to future assignments.

### Saved default lineup

- Saving a default lineup is optional. Events can be created without one.
- Every instrumentation slot must be filled before the leader can save a default lineup. Duplicate musician assignments are not allowed.
- An event does not automatically populate musician assignments. The leader explicitly selects **Apply default lineup**.
- Applying the default uses the saved band default, not the most recent event's lineup. It does not send invitations.
- Map surviving template-linked slots, omit removed template slots, and leave extra event-only slots empty. Confirm before replacing local selections.
- The leader can adjust the resulting event lineup before sending invitations.
- If an instrumentation change makes the default incomplete, applying it is unavailable until the leader completes and saves it again.
- Applying a saved default is also unavailable if an assigned musician is no longer a current band member or no longer eligible for that slot's instrument. The leader must correct and save the default before applying it again; existing event assignments remain unchanged by instrument-eligibility edits.

## 4. Event lineups and invitation lifecycle

### Preparing and sending a lineup

- Each event starts with the band's instrumentation. The leader may add or remove slots for that event without changing the band template.
- Each event or poll lineup must retain at least one instrument slot; slots may be empty.
- The leader selects eligible current band members for the slots, with at most one musician per slot and one slot per musician.
- Empty slots are allowed on an event. The leader can invite the selected musicians while continuing to fill other slots.
- Lineup selection does not immediately contact musicians. Saving the form commits the lineup and sends its invitations and updates as one action. There is no separate save-then-send workflow or requirement for persisted unsent drafts.
- Sending an invitation creates a Pending response and makes the event appear in the invited musician's datebook.
- Unsent assignments do not appear in musicians' datebooks and do not trigger invitation emails.
- Unsent lineup selections are visible only to the leader, even when other band members can view the event. An assignment becomes visible to other permitted viewers only after its invitation is sent.
- Replacing an invited musician takes effect on save: the original invitation is removed and the replacement receives a new Pending invitation. Preparing a replacement in the form has no effect on the original musician until saved.
- The leader can replace musicians and invite additional musicians before the event starts. A replacement is a new invitation; it does not inherit the previous musician's response.

### Responses and datebook behavior

| Assignment or response | Musician's datebook | Event lineup |
| --- | --- | --- |
| Unsent assignment | Absent | Visible only to the leader until its invitation is sent. |
| Pending | Present with a distinct Pending state | Pending |
| Accepted | Present with a distinct Accepted state | Accepted |
| Declined | Removed immediately | Retained as Declined until removed or replaced by the leader. |
| Removed or replaced | Absent | No longer an active assignment. |

- A musician can accept or decline their own invitation.
- A decline reason is optional, has a maximum of 1,000 characters, and is visible only to its author and the band leader. The limit and visibility were confirmed during specification review on 19 November 2026.
- Before the event starts, a musician can change their response while their invitation remains assigned, including changing Declined to Accepted. A newly accepted invitation returns to the datebook.
- Every initial response and actual response change triggers a leader email, subject to the leader's preferences.
- A leader participating as a musician must be assigned a slot and accept an invitation. Leadership does not create an automatic assignment or acceptance.
- Invitation responses and lineup changes close when the event starts. Past events retain their lineup and response history.

### Event visibility

- Datebooks contain only issued invitations that are Pending or Accepted. Membership alone does not add an event.
- By default, unassigned current band members may see an event in the band schedule.
- The leader may hide an event from uninvited members.
- For a hidden event, the leader and invited musicians can still see the event, its full lineup, and response statuses. Uninvited members cannot access it, including through direct links.
- A Declined invitation remains an invitation for visibility and response-changing purposes until removed or replaced. It does not restore the datebook entry or enable update emails.
- Members permitted to view an event can see its lineup and response statuses, but never another member's private decline reason.

### Editing and cancellation

- Saving edited event details is also the send-update action. There is no separate **Send update** step after saving the form.
- Changing the event's date, start time, or end time resets previously Accepted invitations to Pending. Existing Pending invitations remain Pending. End-time reconfirmation was explicitly confirmed during specification review on 19 November 2026.
- A timezone edit preserves responses only when local date/time fields and both resolved instants stay identical; it still sends the normal event-detail update email. Otherwise apply the reconfirmation rule. Reject nonexistent daylight-saving times and choose the earlier occurrence when a local time occurs twice, preserving the existing resolver.
- Location changes and other non-time edits do not reset responses.
- Declined invitations do not reset, reappear in the datebook, or receive event-update emails after any edit.
- Removing an already invited musician removes the datebook entry immediately and triggers a removal email according to that musician's preferences.
- The leader cannot suppress an individual removal email; recipient preferences determine delivery.
- Deleting an upcoming event triggers cancellation emails for Pending and Accepted invitees, according to their preferences. Declined musicians receive no cancellation email.
- Leaders may delete past events, including in-progress events, without cancellation emails, preserving existing behavior.
- Notification preferences affect email delivery, not invitation state, reconfirmation requirements, datebook entries, or access permissions.

## 5. Membership and ownership lifecycle

- Leaders can remove members from a band.
- Removing a member also removes their assignments from all upcoming event lineups and sends the applicable removal emails. Their datebook entries disappear and their band access ends.
- Removing a member also removes them from open rehearsal polls. Their votes are excluded from the active poll, and they cannot view or respond to it after removal.
- Past event lineups and response history remain historical records; they do not grant former members continuing access.
- Deleting a band cancels its upcoming events and open rehearsal polls. Queue cancellation emails using the normal recipient rules and each recipient's notification preferences: Pending/Accepted scheduled-event invitees and all current open-poll invitees. Confirmed during specification review on 19 November 2026.
- The band always has exactly one leader. Ownership can transfer to another current member.
- After transfer, the previous leader remains an ordinary member. The new leader gains management rights and receives subsequent leader-directed emails.
- A leader must transfer ownership or delete each band they lead before deactivating their account. Deactivation cannot leave a band without an active leader.
- Successful deactivation automatically removes the account's current memberships, upcoming event assignments and open-poll participation, including active poll votes. Past event and closed-poll historical records remain. Confirmed during specification review on 19 November 2026.

## 6. Rehearsal availability polls

### Creating and inviting

- Polls are for rehearsal planning.
- The leader chooses an instrumentation-based lineup first and invites only those selected musicians to vote.
- The leader may add and invite eligible current band members while a poll is open, following the same instrument-slot and one-slot-per-musician rules. Each new invitee answers all current options; existing musicians' saved votes remain unchanged. The new invitation follows the normal poll invitation email preferences.
- The leader may remove a musician from an open poll without removing them from the band. They leave that poll's lineup, their votes are excluded, and they can no longer submit answers. Continued viewing follows the poll's visibility rules for uninvited band members.
- Removing an invited musician from an open poll, directly or through band removal, triggers a removal email under the same notification preference as scheduled-event removal.
- Cancelling an open rehearsal poll closes it to responses and emails all currently invited musicians, subject to their removals and cancellations preference. Previously removed musicians are not notified.
- The leader supplies proposed dates and time ranges. Each poll allows a maximum of 30 proposed date/time options, confirmed during specification review on 19 November 2026. A poll has no confirmed rehearsal time until finalized.
- Require at least one proposed option. New or changed options must start in the future; unchanged elapsed options may remain while the poll is open. Finalization must select a future option.
- A poll stays out of the datebook. Invited musicians reach it from the band schedule or an invitation email.
- If all proposed times pass, the poll remains open until the leader updates or cancels it. Show a prompt to add future options or cancel; passing time alone does not automatically close the poll. Confirmed during specification review on 19 November 2026.
- Event visibility rules apply: the leader may hide the poll from uninvited band members.

### Voting

- Display a grid with proposed times as columns and invited musicians as rows. No rank or hierarchy is required in row ordering.
- A musician may edit only their own row and can see the other invited musicians' saved answers.
- Each proposed option requires a Yes or No answer before that musician can save. There is no Maybe answer or partially completed submission.
- Saving persists the answers and updates the visible saved state. Draft selections are not saved implicitly.
- Each save that changes availability sends the leader one summary email, rather than one email per changed cell, subject to notification preferences.
- No live synchronization, push updates, or background polling is required. Other musicians' answers reflect the last successful load or explicit refresh.
- The leader may add or change options after inviting musicians. New or changed options require fresh answers; unchanged options retain their votes. Affected respondents must answer every current option on their next save.
- Adding, changing, or deleting proposed times triggers review/update emails for retained invited musicians, subject to preferences. Metadata-only edits do not introduce a new notification category. A timezone-label-only edit preserving local fields and instants preserves votes; meaningful time changes require fresh answers for affected options.

### Finalizing

- The leader may select any proposed time, including one with No votes or missing responses. The poll informs the decision without blocking it.
- Finalization requires at least one currently invited musician. If removals leave the poll empty, the leader must add a musician or cancel it; the empty poll remains open. Confirmed during specification review on 19 November 2026.
- Finalization creates the scheduled rehearsal with Pending invitations for everyone in the current invited lineup, regardless of their poll answers.
- Musicians confirm the scheduled rehearsal separately using the standard invitation response flow. A Yes poll answer is not an Accepted invitation.
- Finalization triggers event invitations and their datebook entries. Email opt-outs do not prevent invitation creation.
- The poll closes permanently when finalized. Availability answers remain viewable but cannot be edited or reopened.
- Subsequent date/time edits use the normal event reconfirmation rules rather than reopening the poll.

## 7. Email notifications and preferences

Use Resend for outbound email. V2 has email notifications only; it does not introduce an in-app notification inbox, badge, or notification center.

Every user has a notification master switch and individual category switches. All notification categories are enabled by default. Disabling all notification emails overrides the category selections without disabling security/account emails.

The following six notification categories and their triggers are agreed:

| Category | Triggers and recipients |
| --- | --- |
| Invitations | New event invitations and rehearsal poll invitations to the selected musicians. |
| Event updates | Saved event-detail changes to Pending and Accepted invitees; date/time changes require reconfirmation. |
| Removals and cancellations | Scheduled-event or open-poll assignment removal, including removal through band membership changes, upcoming event cancellation, and open rehearsal poll cancellation. |
| Invitation responses | Every initial event response and later response change, sent to the current leader. |
| Poll updates | Added, changed, or deleted proposed times or meaningful poll timezone changes, sent to retained invited musicians. |
| Poll responses | One summary per saved availability change, sent to the current leader. |

- Security/account messages remain available regardless of the notification master switch or category settings. These include verification, password recovery, and email-change security notices.
- Event updates and cancellations exclude Declined invitees. Removal of an issued invitation has its own removal-notification rule.
- Preferences are user-wide across bands; leadership does not override another user's preferences.
- Emails link to authenticated application pages. Links do not bypass event visibility, membership, or response permissions.
- A successful product action must not be reported as failed merely because email delivery fails. The backend specification must define recoverable delivery and duplicate prevention without allowing a retry to duplicate the underlying invitation, response, or finalization.

## 8. Account verification, recovery, and sessions

### Registration and email changes

- New registrations require email verification before access to the main application. Verification and resend/recovery screens remain available while unverified.
- After successful registration verification, continue directly into the application if the original registration session is still valid and belongs to the verified account. Otherwise require login; the verification link alone does not sign the user in. Confirmed during specification review on 19 November 2026.
- Changing an email address requires the current password.
- The old email remains the account's active address until the new address has been verified.
- Confirming the new email address signs out all sessions on all devices, including the confirming session. The user must log in again using the new active address. Confirmed during specification review on 19 November 2026.
- Send verification to the proposed new address and a security notice to the old address.
- Registration and email-address-change verification links expire 24 hours after issuance. Users can request a replacement after expiry. Confirmed during specification review on 19 November 2026.
- There is no separate v1-user verification rollout or account backfill; implementation targets a fresh development database.

### Password management

- Logged-in password changes require the current password.
- New passwords require at least eight characters and at most 72 UTF-8 bytes while bcrypt is used. Never silently truncate passwords; use the same validation in registration, change, and reset flows.
- The login screen provides **Forgot password**, leading to an email-entry screen and an emailed link to an application password-reset page.
- Reset requests use a consistent confirmation message for existing and nonexistent accounts.
- Password-reset links expire 30 minutes after issuance. Users can request a new link after expiry. Confirmed during specification review on 19 November 2026.
- Requests for registration verification, email-change verification, and password-reset emails share a 60-second cooldown and a maximum of five requests per hour per normalized email address. Apply the same limits to unknown addresses without revealing account existence. Confirmed during specification review on 19 November 2026.
- Successfully issuing a replacement registration verification, email-change verification, or password-reset link invalidates earlier unused links for that account and purpose; only the newest link works. A rejected or rate-limited request does not invalidate the current link. Confirmed during specification review on 19 November 2026.
- Verification and reset tokens must be securely generated, time-limited, single-use, and invalid after successful use. The backend specification records the confirmed token lifetimes and defines resend limits, abuse controls, and storage contracts.
- Password changes and password resets invalidate all sessions on all devices, including the initiating session. The user must log in again.
- Resetting a password does not automatically create an authenticated session.

Recovery controls follow the [OWASP Forgot Password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html); email flows should also follow the [OWASP Email Validation and Verification guidance](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).

### Session expiration

- Sessions expire after **24 hours of inactivity**.
- Sessions also expire **seven days after authentication**, regardless of continued activity.
- Qualifying authenticated user activity may extend the inactivity deadline, but never the seven-day absolute deadline. Passive page presence must not keep a session alive indefinitely.
- Both deadlines are enforced server-side. Cookie renewal alone cannot extend an expired session.
- Expiration requires a fresh login, with a clear explanation and safe return destination when appropriate. Expired sessions cannot successfully submit edits or responses.

Server enforcement and the distinction between inactivity and absolute expiration follow the [OWASP Session Management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The 24-hour and seven-day values are product decisions from this interview.

## 9. Existing behavior and scope limits

Continue the existing band-scoped permissions and account/navigation/error handling, with event visibility and datebook inclusion changed as described above. Preserve event timezone storage and chronological ordering by actual start instant.

Unless separately agreed, this release does not add:

- Recurring or overnight events, viewer-timezone conversion, calendar sync, or cross-band conflict detection.
- Guest/substitute invitations outside band membership, membership invitation acceptance, or join links.
- Multiple instrument assignments for one musician at the same event, or required/optional instrument flags.
- Automatic use of the last event's lineup.
- Performance availability polls, Maybe answers, automatic time selection, or live poll updates.
- Reminders, setlists, chart/PDF libraries, standalone notes/tasks, contracts, billing, or payments.
- Infrastructure provisioning, containerization, deployment automation, or v1 data migration.

## 10. Verification expectations

Frontend and backend specifications must turn these behaviors into shared acceptance criteria and proportionate tests. Cover the meaningful workflows and permission boundaries rather than mirroring implementation details.

1. Create a band with repeated instrument slots; add musicians with multiple eligible instruments and a shared custom instrument.
2. Save a complete optional default lineup, apply it explicitly, and prevent invalid or duplicate assignments. Template changes preserve existing event lineups and disable incomplete defaults.
3. Prepare an incomplete event lineup without contacting musicians, then save to commit and send invitations in one action. Verify Pending/Accepted/Declined datebook behavior, private unsaved selections, and replacements that take effect only on save.
4. Enforce public-to-band versus hidden visibility, including direct requests, private decline reasons, removed memberships, and ordinary-member editing restrictions.
5. Change responses, replace musicians, remove band members, and verify resulting access, datebook, and email behavior.
6. Reset Accepted invitations on time changes, retain responses on location changes, exclude Declined invitations from update/reset/cancellation flows, and close responses/lineup edits at event start.
7. Exercise poll row ownership, all-option answer validation, explicit saving, preserved votes on unchanged options, option-update emails, and finalization into fresh Pending invitations. Band member removal removes the musician from open polls, excludes their votes, and revokes access. Poll-only removal excludes their votes and prevents further answers while preserving band membership and enforcing uninvited-member visibility. Finalization cannot duplicate the rehearsal or reopen the poll.
8. Exercise every email trigger with default preferences, category opt-outs, and the master switch; account/security messages remain available. Email failure does not lose a saved product action or duplicate it on retry.
9. Verify ownership transfer and blocked leader deactivation without a handover or band deletion.
10. Verify registration and email-change verification, current-password checks, reset token expiry/reuse rejection, generic recovery responses, and session invalidation after password changes/resets.
11. Verify 24-hour inactivity expiry and seven-day absolute expiry independently, including active use that cannot extend the absolute deadline.
12. Run relevant existing automated checks and smoke the affected flows on responsive layouts, including loading, validation, expired-session, stale-permission, and recoverable-error states.

No tests, deployment checks, or implementation reviews are claimed by creation of this planning document.

## 11. Specification alignment and decision record

The approved global scope is captured in the following aligned documents:

1. The shared contract defines domain states, permissions, transitions, validation rules, notification categories, errors, and the confirmed decision register.
2. The frontend specification defines instrumentation/lineup forms, datebook states, visibility, responses, poll grid, account flows, and email preferences. Drag-and-drop remains an optional design exploration; clear mobile and keyboard-accessible interactions are required.
3. The backend specification defines domain/storage changes, authorization, APIs, atomic transitions, session expiration/revocation, account tokens, and Resend delivery.
4. All previously proposed defaults below are approved. Adding invitees to open polls preserves existing votes; removing a musician, either directly or through band removal, excludes their votes. A replacement follows those removal and addition rules and does not inherit votes. Ticket creation and implementation require a subsequent request.

### Approved defaults

The user approved all remaining proposed defaults on 19 November 2026, covering both product behavior and technical details. These decisions are also recorded in the [shared decision register](../../../backend/backend-specs/v2/00-shared-contract.md#12-confirmed-decision-register). Previously confirmed decisions remain approved.

The shared contract is the basis for the frontend and backend specifications, updated in that sequence after this approval.

#### Product behavior — approved 19 November 2026

| Approved topic | Approved default |
| --- | --- |
| **Past-event deletion** | Leaders can delete past events without sending cancellation emails, preserving existing behavior. |
| **Starter instrument catalog** | Vocals, Guitar, Bass, Drums, Keyboards, Piano, Percussion, Saxophone, Trumpet, Trombone, Violin, Cello. Band-wide custom instruments cover others; no catalog administration UI. |
| **Minimum slots, options, and eligibility** | At least one slot per event/poll and one option per poll. Adding a member requires at least one eligible instrument; later edits may clear eligibility. The existing requirement for at least one slot when creating a band is already part of the global scope. |
| **Timezone details** | Preserve responses on a timezone-label-only edit only if local date/time fields and both resolved instants stay identical. Otherwise apply the approved time-change reconfirmation rule. Reject nonexistent daylight-saving times; choose the earlier occurrence when a time occurs twice. |
| **Other poll edge cases** | Newly created or changed options must be in the future; unchanged elapsed options may remain. Deleting options sends poll-update emails. Metadata-only edits do not introduce a new notification category. |
| **Applying the default lineup** | Fill surviving slots linked to the band template, omit removed template slots, and leave event-only extra slots empty. Ask for confirmation before replacing local selections. |
| **Password bound** | Retain the minimum of eight characters. While bcrypt is used, new passwords have a maximum of 72 UTF-8 bytes, with no silent truncation. |

#### Technical details — approved 19 November 2026

The user's approval of all remaining defaults explicitly covers these implementation choices as well as the product behavior above.

| Approved topic | Approved default |
| --- | --- |
| **Additional abuse controls** | In addition to the approved per-address limits, allow at most 20 verification/reset email requests per hour per IP and 10 failed token submissions per 15 minutes per IP and purpose. |
| **Concurrency and retry records** | Use explicit aggregate versions and independent poll vote-row versions; retain API idempotency records for seven days. The user-facing stale-save rejection and explicit reload behavior is already approved. |
| **Token storage** | Use securely generated, purpose-bound, hashed single-use tokens. If delivery needs the raw token, keep it only in an encrypted temporary email-outbox payload, with expiry and removal after terminal delivery. Token lifetimes and newest-link-only behavior are already approved. |
| **Email delivery** | Use a PostgreSQL outbox in the existing application, stable notification/provider keys, and bounded retries within the provider's deduplication window. Do not blindly retry uncertain sends beyond that window. Check notification preferences before first dispatch. |

### Confirmed concurrent-edit behavior

Confirmed during specification review on 19 November 2026: if relevant server state changes after a form is loaded, reject its stale save without overwriting newer data. Ask the user to reload, explain that reloading discards unsaved edits, and do not merge or resubmit automatically. Independent musicians' poll answer rows do not conflict with each other, and vote-only saves do not invalidate the leader's poll composition form.

### Decisions to revisit after user feedback

- Leaders currently must be added to a lineup and accept their own invitation. Evaluate this with real users before deciding whether leader assignments should be automatically accepted.
- **V3: add in-app notifications.** V2 deliberately limits notification delivery to email while retaining ordinary invitation and status displays within event/poll pages.
