# BE-V2-12 — Expose authorized event reads and cancel events safely

> **Status:** Completed — [merged PR #95](https://github.com/CaelanRT/bandos/pull/95)
> **Dependencies:** [03](03-mutation-concurrency.md), [04](04-notification-delivery.md), [10](10-event-save-invitations.md), [11](11-event-response-time.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 4, 7–8
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–3, 5, 7

## Outcome

Event lists/details support invitation-based datebooks and enforce hidden visibility and private reasons; leader deletion removes active access with correct cancellation effects.

## In scope

- Update existing band event list/detail queries and serializers with canonical instants, slots/statuses, myInvitationId and current canManage/canRespond flags, preserving existing query behavior.
- Enforce identical hidden/visible permissions for list and direct reads and current membership on every request. Expose enough own invitation data for the frontend's existing cross-band datebook reads.
- Implement versioned/idempotent existing event DELETE with soft deletion and `{data:{message}}`, atomically updating active eligibility and cancellation effects.

## Acceptance criteria

1. Visible-to-band events are readable by current members; hidden events only by current leader/current invitees including Declined. Former members and foreign-band/hidden/deleted IDs get not-found.
2. Lineup/statuses are available to authorized viewers; declineReason is omitted entirely for other ordinary members in both list and detail projections.
3. Reads distinguish own Pending/Accepted future invites from Declined/removed/absent invitations; leaders gain no automatic datebook entry. Canonical startsAt permits startsAt/bandId/eventId chronology without database timezone ambiguity.
4. Upcoming deletion cancels access/datebook eligibility and emails only current Pending/Accepted invitees; Declined is excluded. Deleting past/in-progress events remains allowed and sends no cancellation.
5. Deleted resources are unavailable and retry cannot repeat cancellation. Authorization is rechecked before replay; stale deletion and permission loss create no effects.

## Verification

Test the list/direct visibility matrix, private-reason projections, former membership, own invitation transitions and cross-band chronological fixtures. Test future/exact-start/in-progress/past deletion, recipients and response-loss replay. Covers V2-04, V2-05 and deletion portions of V2-06.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.

## Implementation and verification

- Read projections enforce current active-band membership and expose ordered slots,
  own invitation identity/status, private reasons only to their owner/current leader,
  canonical UTC instants and current permission flags. Existing list ordering is retained.
- DELETE now uses the shared session/version/idempotency transaction and band/event
  locks. Soft deletion, invitation retirement, version increment, cancellation effects
  and replay record commit together. Only current Pending/Accepted invitees receive
  upcoming cancellation effects; at/after start deletion sends none.
- Regression command: `TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55441/postgres node --test test/event-save.integration.test.js test/member-defaults.integration.test.js test/band-catalog.integration.test.js test/mutation-concurrency.integration.test.js test/mutation-validation.test.js test/notification-delivery.integration.test.js test/notification-mail.test.js test/relational-storage.integration.test.js test/bounded-sessions.integration.test.js test/registration-verification.integration.test.js test/password-recovery.integration.test.js test/profile-email-change.integration.test.js test/runtime-config.test.js test/frontend.integration.test.js` — **122 passed** in isolated databases on a disposable PostgreSQL 16 server.
- `node --test test/runtime-security.integration.test.js` with a fresh TLS test database,
  trusted/untrusted test CAs and fake mail provider — **3 passed**.
- `node --check controllers/event.controller.js`, `node --check routes/event.routes.js`
  and `git diff --check` — passed.
- Actual-app HTTP smoke passed verified login, list/detail reads, response/replay,
  Origin rejection, reconfirmation, cancellation/replay and deleted access, using
  an isolated database and fake provider.
- Legacy band/event smoke scripts were attempted: band setup stops at
  `EMAIL_VERIFICATION_REQUIRED`; event setup reaches the registration limit after
  the band script. These scripts do not provision verified v2 accounts. An initial
  wildcard test run lacked runtime-security/readiness fixture settings; security
  was rerun successfully with TLS fixtures. The unrelated database-outage/readiness
  suite was not rerun.
- Independent `review-ticket` review — **PASS** on all five acceptance criteria, with no findings; reviewer independently reran all **24 event tests** successfully.

## Completion

Confirmed [PR #95](https://github.com/CaelanRT/bandos/pull/95) merged into remote `main` on 20 November 2026 (merge commit `6ec2846`). Completion metadata is persisted on `main`; BE-V2-13 is next.
