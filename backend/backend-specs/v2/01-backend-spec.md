# bandOS v2 — Backend implementation specification

Status: Specification review complete; aligned with the approved shared contract. Backend tickets BE-V2-01–05 are completed; BE-V2-06–18 have not started.
Updated: 19 November 2026.

## Implementation status

Updated after confirming the implementation PRs merged into `main` on 19 November 2026:

| Slice | Delivered behavior | Evidence |
| --- | --- | --- |
| [BE-V2-01](tickets/01-relational-storage.md) — Completed | Fresh v2 relational schema and integrity constraints. | [Merged PR #70](https://github.com/CaelanRT/bandos/pull/70); completion recorded in [PR #72](https://github.com/CaelanRT/bandos/pull/72). |
| [BE-V2-02](tickets/02-bounded-sessions.md) — Completed | Current-account/generation checks; 24-hour idle and seven-day absolute deadlines; qualifying activity; full/restricted user/session envelopes; browser Origin checks; protected-write account locks and commit-boundary rechecks. | [Merged PR #73](https://github.com/CaelanRT/bandos/pull/73). |
| [BE-V2-03](tickets/03-mutation-concurrency.md) — Completed | Shared ordered-lock transaction, version, idempotency replay, validation and no-op helpers; seven-day replay pruning. Endpoint integration remains assigned to later domain tickets. | [Merged PR #76](https://github.com/CaelanRT/bandos/pull/76); 41 passing tests and independent review recorded in the ticket. |

[BE-V2-04](tickets/04-notification-delivery.md) is completed ([merged PR #78](https://github.com/CaelanRT/bandos/pull/78)). [BE-V2-05](tickets/05-registration-verification.md) implements registration verification, shared token issuance accounting and original-session continuation; see [runtime behavior](../../db/account-tokens.md). Independent review passed; completed in [merged PR #80](https://github.com/CaelanRT/bandos/pull/80). Tickets 06–18 remain unstarted. See the [ticket sequence](tickets/00-ticket-sequence.md). The requirements below describe the complete target, not an assertion that all v2 endpoints are available; the frontend v2 specification remains unimplemented.

Verification recorded for BE-V2-02 includes 21 passing session/storage tests and nine passing configuration, runtime-security and frontend-serving tests, followed by an independent review with no remaining findings. Legacy smoke scripts were attempted but did not pass: band setup encountered the required verification gate; event setup generated a username over the existing maximum. See the ticket for details. This documentation update does not claim a new runtime test run.

## 1. Purpose, authority, and boundaries

Implement the server-side behavior in the [global v2 spec](../../../artifacts/feature-planning/v2/v2-spec.md), using the exact [shared contract](00-shared-contract.md) consumed by the [frontend spec](../../../frontend/frontend-specs/v2/00-frontend-spec.md). Shared sections 2–10 define HTTP shapes, versions, errors, visibility, transitions, and notification triggers; they are requirements of this spec, not optional integration suggestions. Shared section 12 records confirmed decisions. The user approved all remaining product and technical defaults on 19 November 2026; no outstanding approval questions remain for this scope. Ticket creation and implementation require a subsequent request.

Retain Express, PostgreSQL, existing route/controller/middleware conventions, database-backed cookie sessions, existing event validation/resolution, and current security/runtime configuration. Extend the current implementation rather than introducing services, a broker, GraphQL, bearer authentication, or a new deployment topology. Resend delivery and an application-owned durable dispatcher are in scope; infrastructure provisioning and deployment automation are not.

Development data can be recreated during later implementation, but this document authorizes no database deletion. No v1 migration/backfill/compatibility layer is needed. The existing [runtime API contract](../v1/00-api-contract.md) remains a historical v1 reference. The implementation status above identifies delivered v2 changes; later tickets will update the runtime reference for their verified slices.

## 2. Existing implementation and intended changes

| Existing responsibility | V2 change |
| --- | --- |
| `app.js`, session store and authentication middleware | Enforce server-side idle/absolute deadlines, verified-access gate, account session generation, activity classification, Origin checks. |
| Band controllers/access middleware | Add catalog/template/default/eligibility, member removal, atomic sole-owner transfer, current ownership checks. |
| Event controllers/access middleware | Snapshot slots, persist issued invitations only, privacy-filtered serialization, responses, visibility-filtered reads, time reconfirmation and cancellation. |
| `utils/event-schedule.js` | Retain canonical resolver, derive/store UTC instants, reuse for options. Avoid PostgreSQL overlap-resolution differences. |
| Auth/user controllers and validation | Add purpose-bound verification/reset/email-change flows, current-password validation, all-session revocation, notification preferences. |
| Frontend cross-band event reads | Return only permitted events and own invitation data; no required new datebook endpoint. |
| Existing test/smoke tooling | Extend for meaningful cross-request transitions, permissions, time boundaries, and delivery failure. |

Enforce the approved range of 1–50 slots on band instrumentation, event lineup and poll lineup creation/edits, counting empty as well as filled slots. Require at least one eligible instrument when adding a member; allow later eligibility clearing. Serve the starter catalog defined in shared section 4. Reject empty or oversized slot arrays with field-level `VALIDATION_ERROR` on `instrumentation` (band creation) or `slots` (other slot writes), without domain or email side effects.

Keep handlers small enough to inspect. Extract transaction or email helpers where repeated behavior warrants it; do not build a generic workflow engine. Validate changed profile/deactivation routes properly instead of preserving known v1 validation gaps.

## 3. Storage model and integrity

The following describes required persisted facts and constraints, not mandatory table/file names. Use straightforward relational tables and existing identity-key conventions.

| Entity | Required facts / constraints |
| --- | --- |
| User | Existing identity/hash/active fields; verified timestamp, pending email, account `version`, `session_generation`. Active email remains case-insensitively unique. Never activate pending email before verification. |
| Session | Existing store plus user ID, generation captured at login, `authenticatedAt`, `lastActivityAt`, access level. Expire stored row/cookie no later than min(last activity +24h, authentication +7d). |
| Band / membership | Existing data plus band version and sole owner reference. One membership per user/band. Active band owner must be an active current verified member. Derive role from owner or maintain roles transactionally with constraints. |
| Instrument catalog | Stable instrument IDs and band association/name; case-insensitive band/name uniqueness. Starter catalog available to verified users before creation. Seed a new band's choices without leaking another band's custom instruments. |
| Member instruments | Unique membership/instrument pairs, both scoped to same band. Empty later eligibility permitted. Eligibility removal does not cascade into issued event invitations. |
| Band template slot | Stable slot ID, band, instrument, label, order. Repeated instruments allowed. Removing template slots must not delete event/poll snapshots. |
| Default lineup | Saved revision and template-slot/user mapping. One user once; complete and currently eligible at save. Applicability recalculated on read; preserve repairable mapping after template/member edits. |
| Event | Existing detail fields plus version, visibility, resolved `starts_at`/`ends_at`. Soft deletion retained. Index actual starts for schedule ordering. |
| Event slot | Event-local stable ID, nullable source template slot ID, instrument ID plus display snapshot, label, position. Source link survives template deletion as nullable provenance, not a cascade. |
| Event invitation | Immutable invitation ID, event/slot/user, issued time, response, response timestamp, private reason, retired timestamp/cause. One active invite per slot and per event/user using partial unique indexes. Retirement preserves audit/history. |
| Response history | Invitation/status/actor/time and relevant private reason changes. Store reconfirmation separately from a musician response; do not email leader as if they answered. |
| Poll | Band, version, details, timezone, visibility, open/finalized/cancelled, closure time and unique nullable finalized-event reference. |
| Poll slot/assignment | Snapshot slot facts, current invited user, immutable assignment generation/ID. Retirement excludes active votes. Re-addition creates a new generation. |
| Poll option | Stable option ID, revision, local fields, resolved instants, active/deleted marker/order. Keep prior revisions if needed to explain retained history. |
| Poll vote row/cell | Assignment generation, row version, option ID/revision, Yes/No; unique cell per row/option/revision. Missing is distinct from No. |
| Notification preferences | Unique user row, version, master/category booleans, all true initially. |
| Account token | Purpose, user, digest, target pending email where relevant, issue/expiry/consumed/revoked times. No plaintext token in ordinary domain tables. |
| API idempotency record | Actor/method/path/key unique, request hash, committed status/body, expiry. Commit alongside effects; sanitize sensitive responses and never store submitted passwords/tokens as plaintext. |
| Email outbox | Unique notification effect ID, domain transition, category/security purpose, recipient selector, payload/template version, dispatch state/lease/attempts, provider ID/key, retry time, sanitized last error. |

Use foreign keys, unique indexes, check constraints for enums/valid ranges, and transactions for cross-table invariants. An active owner reference plus deferred membership consistency check is preferable to relying only on a controller convention. Preserve historical musician and instrument names sufficiently for past lineups after deactivation/template edits. Do not expose history as a new audit UI unless needed by the specified screens.

A template/default membership mutation updates the band version and applicability without rewriting events. Expired sessions/tokens/idempotency data may be pruned; historical lineups and terminal poll results must not be removed by that housekeeping. Account deactivation remains soft.

## 4. Authorization, transactions, and concurrent edits

Authenticate active account/generation/deadlines, apply verification gate, load band membership and resource ownership, then validate actor permission. Hidden/cross-band resources use not-found. Validate optional decline reasons against the confirmed 1,000-character maximum after trimming; reject oversized input with field-level `VALIDATION_ERROR` on `declineReason`, without truncating or saving a partial response. Project private fields in the serializer/query; never send decline reasons to an unauthorized client and rely on its UI to hide them.

Serialize competing management/lifecycle operations with a band lock. Acquire locks consistently: affected users in ascending ID order where account state is involved, band rows in ascending ID order, event/poll rows in ascending ID order, then assignment/vote rows. Do not acquire a user lock after holding a band lock; load lock candidates first, then recheck them. Transactions which involve account activity must share an account/generation check so password reset cannot race a later commit from a revoked session. Revalidate authorization, membership, eligibility, expected versions, and time boundaries after locking. Roll back all effects on failure. A serialization/deadlock retry must repeat those checks and reuse the same intent key.

Stale-edit rejection and explicit reload recovery were confirmed on 19 November 2026. Return `STALE_VERSION` without writes or queued email for relevant version mismatches. Independent musicians' answer rows do not conflict, and vote-only changes do not invalidate a leader's poll composition version.

Required transaction units:

1. **Band create/configuration/default:** catalog/template/owner and complete mapping validation succeed together. Validate every referenced ID against the band. Applying a default is client-local; server creation/save never trusts its earlier applicability.
2. **Event create/save:** compare normalized before/after details and slots. Retain unchanged invitation identities; retire removed/replaced identities; validate new assignments; issue Pending replacements/additions. Apply time reset only to retained Accepted invitations. Update event/version/history and enqueue recipient-specific emails once. There is no persisted unsent-assignment state and no separate send API.
3. **Invitation response:** lock event/current invitation, require actor ownership and pre-start time, validate expected version. Record only actual changes. Decline leaves assignment visible but removes its datebook eligibility. Acceptance clears private reason. Return authorized event projection.
4. **Member removal:** lock band and affected upcoming events/open polls; use one server instant for upcoming selection. Retire all future event invitation statuses, remove open-poll rows from active answers, remove membership, and mark default invalid in the same commit. Keep past/finalized records. Enqueue removals for issued assignments, including Declined, irrespective of datebook inclusion.
5. **Ownership transfer/deactivation:** guarantee exactly one active leader throughout the commit. Transfer leaves both musicians' assignments unchanged. Deactivation with any active owned band fails without partial removal; otherwise perform all membership removals and global revocation atomically, including removal of upcoming event assignments and open-poll participation/votes while preserving past-event and closed-poll records (confirmed on 19 November 2026). Avoid partially removing the account from only some bands.
6. **Poll save:** leave open polls open when all proposed times pass; elapsed time alone must not close them or enqueue closure emails (confirmed on 19 November 2026). Preserve option IDs/revisions where semantically unchanged; invalidate only affected current answers. Retire removed assignment generations, start added ones blank. Reordering alone does not erase votes. Enforce 1–30 current proposed options on create and edit; reject an empty or oversized set with field-level `VALIDATION_ERROR` on `options` and no side effects. New or changed options must be future; unchanged elapsed options may remain. Deleting options queues poll-update emails for retained invitees. Metadata-only edits do not create a new notification category. Updating timezone must recompute each option's instants; representation-only edits preserving local fields and instants preserve answers. Complete row saves validate composition version plus row version and exact option revisions. Two musicians saving unchanged composition must not conflict solely because another row changed.
7. **Finalization:** lock open poll and band, require at least one current invited musician (otherwise return the shared `VALIDATION_ERROR` without closing the poll or creating effects), validate chosen current future option and lineup, insert event/slots/fresh Pending invitations, enqueue invitations, set final event link and terminal poll state together. Unique source-poll/event relationship backs up locking/idempotency. Return existing event on an equivalent repeated finalization; never reopen a poll.
8. **Cancellation/deletion:** atomically close resource, remove visibility/datebook eligibility, and enqueue proper cancellation recipients. Band deletion performs the confirmed future-event/open-poll cancellation cascade in the same transaction: notify Pending/Accepted event invitees and all current open-poll invitees subject to each recipient's preferences, excluding Declined event invitees and previously removed poll invitees; leader deletion of a past event, including an in-progress event, remains available and queues no cancellation email. A cancellation/member-removal race cannot leave surviving invitations or double-notify one retired assignment.

API idempotency and outbox uniqueness are distinct protections. A database failure before commit creates no replayable success, no invitation and no email. A lost HTTP response after commit can be retried with the same key; do not let expected-version rejection obscure a recorded successful replay. A completed terminal action remains terminal after replay-record expiry.

No-op normalized saves are successful with unchanged versions and no mail. Validation, stale-version, permission, token, and session errors enqueue nothing. Retain the current server schedule resolver's same-day and DST behavior. At start-time boundary reject all event detail/lineup/response mutations before evaluating proposed future scheduling changes.

## 5. Recoverable Resend delivery

Create outbox records in the same PostgreSQL transaction as domain changes. A bounded dispatcher in the existing application process claims due rows using database leases/row locking, safely across multiple instances. Restart must recover abandoned leases. No external queue or infrastructure ticket is required by this design.

A notification effect is uniquely identified by transition ID, kind, and recipient identity; replacements can have separate removal and invitation effects. Use one provider call per notification initially. Never derive uniqueness solely from event ID, because later legitimate updates need new emails.

State model: `queued → sending → sent`; alternatives are `suppressed`, `retryable`, `failed`, or `delivery_unknown`. Persist attempted request fingerprint, stable provider key, provider ID when known, attempt count and next attempt time. On first dispatch, resolve current leader where applicable, check recipient active state and preferences, freeze address/rendered content, then send. Removal notices can go to an active former band member; band access is not required to receive them. Domain links still enforce access. Security emails to an old/new address use their explicit security-recipient rule, not a notification recipient lookup.

[Resend documents a 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Use a stable key such as `bandos-notification/<notificationId>` and identical payload on retries. Retry transient failures/timeouts with bounded exponential backoff and jitter; the approved default schedule is immediately, 1m, 5m, 30m, 2h, 6h, 12h from first attempt, with a hard stop before 23h. Honor provider retry timing only within that bound. Permanent validation/address errors become failed. An uncertain request is retried with its original key during the safe window; never generate a new key to bypass ambiguity.

After the window, do not blindly replay an uncertain send: mark `delivery_unknown`, retain evidence, and allow provider-status reconciliation where available. An explicit later retry must first establish that the provider did not accept the original. A definite unsent local failure can be recovered, but must retain its effect identity. This gives bounded duplicate prevention without claiming impossible exactly-once mailbox delivery across arbitrary outages. Provider acceptance is recorded as sent, not proof of inbox delivery; webhook processing is not required to meet v2 product behavior.

Domain success is returned even if dispatch subsequently fails. UI success says saved/invitations issued, never promises that every email arrived. No email-status dashboard, inbox, retry button for musicians, or notification badge is introduced. Log sanitized effect IDs and failure classes for existing operational inspection; never log account tokens, passwords, full private reasons, or secret provider keys.

Suppress obsolete security messages if the token was consumed/replaced/expired before first dispatch. A raw token needed in its email may exist only in encrypted outbox payload under an application-held encryption key, with expiry and removal after terminal delivery; domain token lookup stores only a digest. Mail templates must escape user-supplied text and build links from configured trusted application origin, never request Host.

## 6. Account security and sessions

### Token expiry and approved abuse policy

Registration and email-address-change verification tokens expire 24 hours after issuance, confirmed on 19 November 2026. Password-reset tokens expire 30 minutes after issuance, also confirmed on 19 November 2026. Users can request replacement links after expiry. A 60-second cooldown and a maximum of five requests per hour per normalized email address were confirmed on 19 November 2026. Share those address counters across registration verification, email-change verification and password-reset requests; include initial requests and resends and apply equivalent accounting for unknown addresses. Successful replacement issuance revokes earlier unused tokens for the same account and purpose, confirmed on 19 November 2026; rejected/rate-limited requests do not revoke the current token. Commit replacement issuance and old-token revocation together. The additional IP/submission limits below are approved defaults supporting global section 8; these exact values are product choices, not values specified by OWASP.

| Purpose | Lifetime | Issuance limits / behavior |
| --- | --- | --- |
| Registration verification | 24 hours | Confirmed shared per-address limits: 60-second cooldown and 5/hour. Approved additional limit: 20/hour/IP. Resend revokes prior unused verification token. |
| Pending email change | 24 hours | Current password to initiate; same resend/address/IP limits. Replacement issuance revokes the old pending token (confirmed); old active address retained. |
| Password reset | 30 minutes | Confirmed shared per-address limits: 60-second cooldown and 5/hour. Approved additional limit: 20/hour/IP. New issuance revokes prior unused reset token. Request never locks/deactivates account. |
| Token-confirm submissions | Token-specific lifetime | At most 10 failures/15 minutes/IP/purpose; do not disclose account/token lookup results. |
| Register/login | Existing baseline | Keep 5 registrations/hour/IP and 10 login attempts/15 minutes/IP unless separately reviewed. |

Normalize emails using the established trimmed/lowercase convention consistently at registration/login/reset/change; no provider-specific dot/plus rewriting. Rate-limit using the normalized address key even when nonexistent, so response status/cooldown does not become an account existence oracle. Generic request confirmation and comparable work paths apply to nonexistent/inactive addresses; cooldowns return the same `429`/`Retry-After` contract for equal request patterns. Account conflict at registration/email change remains the existing generic conflict behavior.

Generate at least 32 cryptographically random bytes per token, URL-safe encode, and store SHA-256 digest for lookup. Bind tokens to user, purpose and exact proposed address when applicable. Consume under row lock with the account transition in one transaction; reject expiry at `now >= expiresAt`, consumed/revoked/wrong-purpose tokens identically. Concurrent submissions yield at most one success. GET links never consume credentials. Token confirmation, new token issuance, password reset, email change and deactivation invalidate applicable obsolete tokens.

Registration creates an unverified active account and restricted session; main resource routes reject it. Confirmation marks verified and checks the requesting session under the account lock. If it is the original registration-created session for that account and both deadlines/generation remain valid, regenerate its ID, promote it to full access, and return user/session for direct continuation. Preserve authenticatedAt and the original seven-day deadline; successful confirmation may renew idle activity only within that deadline. Store registration origin in the session. Revoke other restricted sessions for the verified account. If the original session is missing, expired or belongs to a different account, verify the email without creating/switching a session and require login; return null user/session. Login with correct unverified credentials returns restricted access so resend/recovery remain available. Unverified accounts cannot be added as band members. Password reset can change an unverified user's password but cannot verify them.

Logged-in password change and email-change initiation verify current password against the locked account. Retain bcrypt and minimum eight-character passwords, enforce 72 UTF-8-byte maximum on new passwords, and never silently truncate. Incorrect current password uses a field-level `403 CURRENT_PASSWORD_INCORRECT`, not session expiry. Reset/current-password flows should perform normal credential work for expected paths and avoid exposing hash or database errors.

Email change stages `pending_email`, emails verification there and security notice to old address. The active login/delivery address remains old until single-use confirmation succeeds. Recheck uniqueness at confirmation; conflict leaves old email active and offers a new request. Successful email-change confirmation clears pending state, invalidates obsolete reset/change tokens, revokes all sessions on all devices including the confirming session, and sends confirmation/security notices to old and new addresses. Require fresh login with the new active address; no automatic login. This session behavior was confirmed on 19 November 2026. Password reset/change send a security confirmation to active address and invalidate reset tokens and all sessions, including the initiating session. Security emails bypass every notification preference.

### Server session enforcement

On login regenerate session ID, set authenticated/last-activity instants from server clock, and capture current user session generation. Registration's restricted session uses the same bounded policy. For every authenticated request, require active account, matching generation, and both unexpired deadlines before route work. At password change/reset, email-change confirmation, registration verification completion, or deactivation increment generation in the transition transaction and remove that user's stored sessions where practical; registration verification alone may preserve the validated original registration session by regenerating its ID and capturing the new generation without resetting its authentication instant/deadlines; generation mismatch is authoritative even if deletion fails. Do not report successful password change as failed solely because cookie/session cleanup after committed generation change fails.

Idle deadline is last qualifying activity +24h, absolute is authentication +7d. Renew only successful user-initiated activity defined in shared section 9. Explicit GET navigation/refresh is distinguishable by `X-bandos-activity: user`; background reads must omit it. This header does not substitute for authentication/Origin validation and cannot move the absolute deadline. No synthetic heartbeat. Enforce expiry/generation again at mutation commit boundary with appropriate locks; a reset cannot be followed by a stale session write committing afterward. Cookie/store touch cannot extend application deadlines. If the cookie/session row already vanished, return generic `AUTHENTICATION_REQUIRED`; frontend must still explain that a fresh login is needed.

Account security rationale follows [OWASP recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [email verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html), and [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Product's 24-hour inactivity and seven-day absolute limits take precedence over illustrative durations in external guidance.

## 7. API delivery and frontend integration obligations

Implement all new/changed routes and shapes in shared sections 4–9; avoid a second competing endpoint list here. Preserve unchanged v1 list/profile/navigation behavior, while replacing membership-based datebook semantics with issued-invitation semantics. Both event list and detail serializers must omit private decline reasons correctly. Poll reads include current option revisions and row versions needed for exact complete saves.

On role/visibility/membership change, subsequent reads/writes use current database authorization, never a role cached at login. Permission flags are informative. Do not return stale privileged representations from idempotency records after access loss. Reject foreign-band instrument/template/slot/invitation/option IDs even if syntactically valid.

Creation returns persisted IDs and versions necessary for the next edit. Error field paths reference client array indexes or `clientKey` context so inputs can be corrected. Store canonical instants and return them rather than requiring the frontend to invent timezone normalization. Retain current event field lengths, name/type/location semantics, and soft deletion. Update the runtime API reference only when relevant behavior is implemented and verified.

## 8. Acceptance and proportionate verification

All shared `V2-01` through `V2-14` scenarios apply. Focus backend integration tests on real database transactions and authorization boundaries; use deterministic server clock and a fake Resend adapter. No real email account/provider call is required in automated tests.

Required coverage groups:

- Template/default/member eligibility validation, repeated instruments, foreign IDs, complete optional defaults, preserved snapshots and grandfathered unchanged event assignments.
- Event invitation identity, partial-lineup atomic saves, replacements/removals, private reasons and hidden/list/direct permissions, response history, chronological datebook inputs.
- Local/instant/end-time/representation-only edits, DST gaps/overlaps, Accepted reset and Declined exclusions, exact-start cutoff, past deletion.
- Member removal and deactivation cascades, band deletion, sole-owner transfer and races with old-leader edits; historical retention without former-member access.
- Poll complete own-row saves, no-op summaries, revision invalidation/preservation, independent respondent concurrency, removal/re-add generation, cancellation, open-state retention after all options pass, rejection of empty-poll finalization without side effects, and repeated/racing finalization into one rehearsal.
- Notification category/master permutations represented by a focused table-driven suite; transaction rollback, provider outage/restart/lease recovery, stable retries and unknown delivery beyond provider window.
- Token generic request behavior, purpose/expiry/reuse/concurrent consumption, staged address uniqueness, verification gate, matching valid registration-session continuation versus absent/expired/mismatched-session login, preservation of the absolute deadline, current-password checks, password session revocation and no reset login.
- Independent idle/absolute deadlines, passive background reads, active use bounded by absolute expiry, revoked-session commit race, response-loss/idempotent replay and stale edits with zero effects.

During implementation run the relevant existing backend test suite and affected event/band smoke checks; add checks for new flows rather than weakening old assertions. Run existing frontend integration/runtime security checks when changes touch routing/session handling. Record actual commands/results when implementing; no such checks are claimed by this planning document. Infrastructure, deployment validation, ticket creation and PR creation are outside this specification-authoring task.
