# Backend v2 ticket sequence

> **Status:** BE-V2-01 Completed ([implementation PR #70](https://github.com/CaelanRT/bandos/pull/70), [completion PR #72](https://github.com/CaelanRT/bandos/pull/72)); BE-V2-02 Completed ([implementation PR #73](https://github.com/CaelanRT/bandos/pull/73)); BE-V2-03 Completed ([implementation PR #76](https://github.com/CaelanRT/bandos/pull/76)); BE-V2-04 Completed ([implementation PR #78](https://github.com/CaelanRT/bandos/pull/78)); BE-V2-05 Completed ([implementation PR #80](https://github.com/CaelanRT/bandos/pull/80)); BE-V2-06 Completed ([implementation PR #82](https://github.com/CaelanRT/bandos/pull/82)); BE-V2-07 Completed ([implementation PR #84](https://github.com/CaelanRT/bandos/pull/84)); BE-V2-08 Completed ([implementation PR #86](https://github.com/CaelanRT/bandos/pull/86)); BE-V2-09 Completed ([merged PR #89](https://github.com/CaelanRT/bandos/pull/89)); BE-V2-10 Completed ([merged PR #91](https://github.com/CaelanRT/bandos/pull/91)); BE-V2-11 Completed ([merged PR #93](https://github.com/CaelanRT/bandos/pull/93)); BE-V2-12 Completed ([merged PR #95](https://github.com/CaelanRT/bandos/pull/95)); BE-V2-13 For Review ([Draft PR #98](https://github.com/CaelanRT/bandos/pull/98)); remaining 5 tickets not started.
> **Created:** 19 November 2026
> **Authority:** [Global product specification](../../../../artifacts/feature-planning/v2/v2-spec.md), [shared contract](../00-shared-contract.md), [backend implementation specification](../01-backend-spec.md)

Implement tickets in numeric order. Dependencies below identify actual prerequisites; the order also keeps shared security/delivery foundations ahead of their domain consumers. A prerequisite's dependencies are transitive. Each implementation includes its own meaningful tests; ticket 18 verifies integrated behavior and records release-readiness evidence. This is a repository backlog, not a set of GitHub issues. Tickets 01–12 have merged with verification recorded in their ticket documents. BE-V2-05 is completed in [merged PR #80](https://github.com/CaelanRT/bandos/pull/80). BE-V2-06 is completed in [merged PR #82](https://github.com/CaelanRT/bandos/pull/82). BE-V2-07 is completed in [merged PR #84](https://github.com/CaelanRT/bandos/pull/84). BE-V2-08 is **Completed** in [merged PR #86](https://github.com/CaelanRT/bandos/pull/86). BE-V2-09 is **Completed** in [merged PR #89](https://github.com/CaelanRT/bandos/pull/89); BE-V2-10 is **Completed** in [merged PR #91](https://github.com/CaelanRT/bandos/pull/91), with 111 passing automated tests, actual-app v2 smoke and independent review recorded in its ticket; BE-V2-11 is **Completed** in [merged PR #93](https://github.com/CaelanRT/bandos/pull/93); BE-V2-12 is **Completed** in [merged PR #95](https://github.com/CaelanRT/bandos/pull/95); BE-V2-13 is **For Review** in [Draft PR #98](https://github.com/CaelanRT/bandos/pull/98), with 132 passing regression tests, 3 runtime-security tests, actual-app poll smoke and independent review recorded in its ticket; tickets 14–18 remain planned.

| Ticket and outcome | Blocked by |
| --- | --- |
| [BE-V2-01 — Establish v2 relational storage and integrity](01-relational-storage.md) | None |
| [BE-V2-02 — Enforce bounded sessions, verification access and browser Origin](02-bounded-sessions.md) | 01 |
| [BE-V2-03 — Add transactional versions and safe idempotent mutations](03-mutation-concurrency.md) | 01, 02 |
| [BE-V2-04 — Deliver preference-controlled email through a recoverable outbox](04-notification-delivery.md) | 01, 02, 03 |
| [BE-V2-05 — Verify registration and safely continue the original session](05-registration-verification.md) | 01, 02, 03, 04 |
| [BE-V2-06 — Add generic password recovery and all-session password revocation](06-password-recovery.md) | 02, 03, 04, 05 |
| [BE-V2-07 — Validate profile edits and stage verified email-address changes](07-profile-email-change.md) | 02, 03, 04, 05, 06 |
| [BE-V2-08 — Create and configure band catalogs and instrumentation](08-band-catalog-template.md) | 01, 02, 03, 05 |
| [BE-V2-09 — Manage member eligibility and repairable default lineups](09-member-eligibility-defaults.md) | 03, 05, 08 |
| [BE-V2-10 — Save event lineups and issue invitation changes atomically](10-event-save-invitations.md) | 03, 04, 08, 09 |
| [BE-V2-11 — Record invitation responses and require time-change reconfirmation](11-event-response-time.md) | 03, 04, 10 |
| [BE-V2-12 — Expose authorized event reads and cancel events safely](12-event-reads-cancellation.md) | 03, 04, 10, 11 |
| [BE-V2-13 — Create and edit rehearsal poll compositions with revisioned options](13-poll-composition.md) | 03, 04, 08, 09, 10, 12 |
| [BE-V2-14 — Save complete own availability rows without respondent conflicts](14-poll-availability.md) | 03, 04, 13 |
| [BE-V2-15 — Finalize one rehearsal or cancel a poll atomically](15-poll-terminal-actions.md) | 03, 04, 10, 11, 12, 13, 14 |
| [BE-V2-16 — Remove members, transfer sole ownership and delete bands atomically](16-band-lifecycle.md) | 03, 04, 09, 12, 13, 14, 15 |
| [BE-V2-17 — Deactivate accounts only after resolving leadership obligations](17-account-deactivation.md) | 03, 04, 06, 07, 16 |
| [BE-V2-18 — Verify the complete backend contract and document delivered behavior](18-contract-verification.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17 |

## Implementation rules

- Read the relevant shared/backend sections and existing implementation before each ticket. The global specification wins accidental conflicts. Exact payloads, envelopes, field names, errors and state transitions come from the shared contract; no competing API is introduced here.
- Retain Express, PostgreSQL, cookie sessions, current controller/middleware conventions, existing schedule resolver and `/api/v1`. Use small helpers when repetition warrants them. No new broker/service topology or generic workflow engine.
- Every domain mutation integrates the session/Origin, version, idempotency and transactional-outbox rules delivered in tickets 02–04. Recheck account generation, current ownership/membership, resource IDs and time boundaries under consistent locks before commit. Idempotency replay rechecks access before returning stored data.
- Positive safe-integer IDs and strict route IDs, UTC ISO instants, unknown-key rejection on changed/new endpoints, trimmed text (never passwords), dotted field errors and sanitized malformed JSON apply throughout. Deletion is HTTP 200 with the shared data envelope, not an assumed 204; endpoints with explicit band/poll deletion results retain their specified shape.
- No-op semantic saves increment no version and send no mail. Stale, invalid or unauthorized actions have zero effects. Replay records persist seven days; domain uniqueness/terminal state must still protect actions afterward.
- Use isolated PostgreSQL integration tests, a deterministic clock and fake Resend. Add a small number of useful behavior/race tests rather than tests mirroring implementation details. Run relevant existing tests and affected smoke checks; record actual commands/results. No nonexistent npm test/lint/build scripts are assumed.
- Follow repository ticket implementation, independent review and Draft PR/status conventions when implementing a ticket. Creating this backlog does not initiate those implementation workflows. Each ticket starts Not started; update its actual workflow state when picked up.
- Out of scope: infrastructure/deployment/containerization, database deletion, v1 migration/backfill/compatibility, frontend UI implementation, recurring/overnight events, guests, multiple simultaneous slots per musician, Maybe answers, live poll updates, in-app notifications and notification dashboards. Local default application remains frontend-owned; backend validates every eventual save.

## Acceptance coverage

All references below point to [shared acceptance scenarios](../00-shared-contract.md#11-cross-stack-acceptance-scenarios). Ticket 18 verifies the integrated backend portions of every row.

| Scenario | Primary tickets | Backend evidence / ownership boundary |
| --- | --- | --- |
| V2-01 | 08, 09, 10, 13 | Catalog, repeated instruments, slot/eligibility bounds, foreign IDs and unique assignments. |
| V2-02 | 08, 09, 10 | Complete defaults, recalculated applicability and immutable snapshots; local Apply/confirmation is frontend-owned. |
| V2-03 | 10 | Atomic partial lineup issue/replacement with stable/fresh identities; unsaved selections remain client-local. |
| V2-04 | 11, 12 | Own Pending/Accepted future invitation data, Declined transitions and leader participation; datebook rendering is frontend-owned. |
| V2-05 | 10, 11, 12, 13, 16 | Hidden/list/direct/privacy/current membership and cross-band write protection. |
| V2-06 | 10, 11, 12 | Response/no-op emails, DST/time reconfirmation, start boundary and past deletion. |
| V2-07 | 04, 09, 16, 17 | Removal/history/defaults, atomic ownership, redirected queued leader mail and blocked leader deactivation. |
| V2-08 | 13, 14 | Revisioned options, own complete rows, generation changes and recipient precedence. |
| V2-09 | 15 | Empty finalization rejection, fresh Pending rehearsal, terminal/racing repeats and cancellation. |
| V2-10 | 04 and each domain ticket | Six categories/master/security bypass, transactional effects, failure/restart and bounded stable retries. |
| V2-11 | 02, 05, 06, 07, 17 | Secure tokens/throttles, verification/session continuation, staged email, password revocation and credentials. |
| V2-12 | 02, 05, 06, 07 | Idle/absolute deadlines, background activity and commit-boundary revocation; safe login return UX is frontend-owned. |
| V2-13 | 03 and each domain ticket | Aggregate/row versions, independent respondents, rollback and seven-day replay with terminal protection. |
| V2-14 | 18 and endpoint-owning tickets | API loading/empty/error/recovery inputs; responsive, keyboard, focus, cache and partial-datebook UI are frontend-owned. |

## Integration handoffs

- After 02–07, account/session shapes and security flows support frontend integration; deactivation's cross-band cleanup completes in 17.
- After 08–12, band configuration/defaults and event invitation/read/response/cancellation flows support integration; membership-removal/ownership/band-deletion cascades complete in 16.
- After 13–15, poll composition, complete-row availability and terminal rehearsal/cancellation workflows support integration.
- 16–17 complete cross-resource lifecycle guarantees; 18 verifies all slices together and updates the runtime reference for delivered behavior. Intermediate foundations are not a claim that the whole v2 API is ready.
