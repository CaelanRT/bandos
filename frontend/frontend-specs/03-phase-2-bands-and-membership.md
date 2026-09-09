# Phase 2 — Bands and membership

> **Status:** Ready for implementation
> **Phase outcome:** Users navigate their bands, create a band, inspect members, and perform supported leader-only management.
> **Discovery source:** Phase 2 Grill Me session, decisions finalized 2026-09-09
> **Governing plan:** [Frontend implementation plan](00-frontend-implementation-plan.md)
> **Backend authority:** [API contract](../../backend/backend-specs/00-api-contract.md), checked against band routes, validation, access middleware, and controller for this specification.
> **Tickets:** [Phase 2 sequence](tickets/phase-2/00-ticket-sequence.md)

## 1. Goal and boundaries

Deliver a shared workspace for leaders and members, with fast sequential member additions and supported band management. Build on the existing authenticated request boundary, session provider, router, validation conventions, and TanStack Query cache. No backend changes are required.

Include responsive browser layouts, keyboard use, meaningful loading/error states, and protection against accidentally discarding forms. Final authored styling belongs to Phase 6.

Exclude real schedules, event queries or mutations, datebook aggregation, account editing, invitations, join links, member removal, leaving bands, role changes, leadership transfer, band caps, search/filter/pagination controls, background polling, pull-to-refresh, native-app optimization, and automatic replay of mutations. Duplicate band names are allowed. Do not show disabled controls for unsupported features.

The Schedule placeholder is an explicit temporary exception to the master plan's no-placeholder rule, approved in discovery. Do not infer additional placeholder modules from this exception.

## 2. Routes and access

| Route | Access and behavior |
| --- | --- |
| `/` | Authenticated interim home: user's bands or zero-band guidance. Phase 4 replaces this with the personal datebook. |
| `/bands/new` | Any authenticated user; dedicated Create a band form. Treat `new` as a static route, not a band ID. |
| `/bands/:bandId` | Current band member or leader; workspace with temporary Schedule page. |
| `/bands/:bandId/members` | Current band member or leader; member list, plus leader-only addition. |
| `/bands/:bandId/settings` | Current band leader only; Rename and a separate Delete section. |

Keep all Phase 1 access enforcement and validated Login/Registration destination restoration. Add explicit recognition of the new and settings routes to destination validation, preserving search/hash and existing rejection of external/unsafe values. Creation's return location is a separate validated internal router-state value, not a post-login destination or a blindly trusted browser-history offset.

Validate targeted IDs as positive base-10 safe integers without leading zero, sign, or decimal. Malformed IDs show a controlled invalid/unavailable route with a home link; they must not request a band or accidentally resolve as creation. Unknown routes retain the existing catch-all. Unfinished event/account routes retain their existing behavior; this phase does not populate unsupported navigation destinations merely to expose them.

A member directly entering Settings is replacement-redirected to that band's Schedule with a contextual permission notice. While role is loading or unknown, show no management controls. A stale leader receiving `LEADER_REQUIRED` follows the recovery in section 8.

## 3. Navigation and interim pages

Desktop has a persistent, narrow navigation index. Show the home/datebook destination, an alphabetical band list, and Create a band once its ticket exists. Keep Logout available. Global band links contain names only; show the user's Leader role inside the selected workspace. Do not create a nonfunctional Account link before account behavior exists.

Order band names case-insensitively using a consistent locale-aware comparator; use `bandId` as the deterministic tie-breaker. Backend list order is creation order, so sort for presentation without mutating cached arrays. Names need not be unique; keys and destinations always use IDs.

**Every band selection from global navigation or the interim home opens `/bands/:bandId` (Schedule), regardless of the current section or destination role.** Do not preserve Members or Settings across band switches. Creation success is the intentional exception: it opens the new band's Members page.

Within a band, show Schedule and Members links; show Settings only to leaders after that feature is implemented. The Schedule page displays its band context and a plain message such as `Schedules are not available yet.` It must not say there are no events, query events, or show event controls. It includes a working Members link.

With no bands, home shows Create a band and quiet guidance: `Already playing with a band? Share your username, @username, with its leader so they can add you.` Use the normalized session username; no invitation or forced-creation flow. With bands, home displays the same sorted band destinations and creation access; it makes no claim about upcoming events.

On narrow screens, collapse the index behind a labeled Menu button. Keep current band name and section visible in the header; non-band pages show their page context. Use links for destinations. Opening/closing, Escape, keyboard focus, and expanded state must be accessible. Successful navigation closes the menu and moves focus to the destination content; cancelled navigation retains usable focus and current context. Long names wrap without horizontal overflow. Do not implement gestures, pull-to-refresh, elaborate animation, or native-app affordances.

## 4. User flows

### Create a band

Creation is reachable from zero-band home and global navigation, including when a user already has bands. The dedicated page has a visible Band name label and Create band/Cancel controls. Store where creation was opened in validated router state; direct entry or an unsafe/missing return value falls back to home. Cancel returns to that location, asking before discarding changed input. If that location has become inaccessible, its route handles normal recovery.

On confirmed `201`, use the returned full band to update navigation/detail data, clear dirty state, and replacement-navigate to the new band's Members page. The creator appears as Leader. Pass a one-time router-state marker that opens the add-member form when that ticket is implemented, then consume it so later visits or refresh do not reopen the form automatically. A late navigation-list response must not erase the newly created band.

### View and add members

Display full name, @username, and a Leader label for leaders. Sort leaders first, then alphabetically by displayed full name within each role group, case-insensitively; break ties by username then user ID. The backend sorts by username, so explicitly sort the presentation. Only active users returned by the API appear. Do not fabricate a member when the server list is empty.

Leaders see Add member on normal visits. Activating it opens a labeled username form with guidance that the person needs an existing Bandos account; use Add member and Cancel controls. Immediately after creation, open it automatically once and focus its username field. Members see neither this form nor its trigger.

After a confirmed addition, merge the returned member by user ID into the detail cache immediately, sort the displayed list, announce success, clear errors/touched state and the username, and keep the form open with focus in the username field. Revalidate detail without allowing an older response to remove the addition. Leaders can add several people sequentially without reopening the form. Never duplicate a row or submit concurrently.

`USER_NOT_FOUND`: `No active account found with that username.` `USER_ALREADY_IN_BAND`: `That person is already in this band.` Associate these messages with the username input, preserve its value, and focus it for correction. The duplicate response includes adding oneself. Closing an untouched or cleared form needs no warning; entered/unsubmitted values do.

### Rename in Settings

Settings contains a labeled name field initialized from the fetched band, Save/Cancel controls, and a separate Delete section. Only leaders can see or enter management UI. Save is unavailable when unchanged or pending. Cancel returns to Schedule with the normal dirty-form warning.

Confirmed Save updates the full band and navigation summary immediately, including alphabetical position, without changing its ID/URL. Stay on Settings, announce success, and reset the dirty baseline. Background refetch must not overwrite an edited name. If the user has not edited, fresh server data may update it.

### Delete a band

Delete opens an accessible confirmation dialog: `Delete [band name]? Everyone will lose access to this band, its member list, and its events.` Provide Cancel and Delete band. No typed name, recovery promise, or implication of permanent database erasure. Cancel is initially focused; Escape cancels while idle and focus returns to the trigger.

Pending deletion prevents duplicates and announces progress. Confirmed `200` clears the band's context and associated private cache entries, updates navigation/home, and replacement-navigates home with a one-time brief confirmation. All roles subsequently lose access to the deleted band and its events. Do not ask an unsaved-name warning after confirmed deletion: that deliberate confirmation covers discarding the draft. On failure retain stable recovery rather than claiming deletion failed to apply.

## 5. Component and state responsibilities

- The existing session provider owns identity, Logout, and expiration. All band reads/mutations use `useSession().authenticatedRequest`, including signals for queries; never bypass it or read cookies/tokens.
- Feature API adapters validate the band/member shapes after the existing transport unwraps `{ data }`. Malformed payloads become controlled client errors instead of empty lists or trusted permissions.
- Feature query hooks own list/detail retrieval and cache coordination. Use shared private keys such as `['private', 'bands']` and `['private', 'band', bandId]`; do not mix list and detail shapes. Later band-scoped resources must be removable by an explicit band-ID predicate/key convention.
- The application/workspace shell owns responsive navigation and context, with one source for fetched role and band identity. A list summary never substitutes for a detail membership check on a targeted route.
- Pages/forms own input, touched/errors, dirty baseline, pending/reconciliation state, and local notices. Remote data remains in Query, not duplicated as durable global state.
- A small shared unsaved-navigation boundary handles SPA links, browser Back/Forward, and form Cancel consistently. Native `beforeunload` supplies best-effort protection for refresh/tab close while dirty; browsers control whether that prompt appears.
- Local accessible notices/dialogs are sufficient. Do not introduce a general notification platform solely for this phase.

## 6. API contract and validation

All paths below are relative to `/api/v1`; requests include credentials through the existing client. Body fields are exact and strict. Band and member payloads are already camelCase.

| Operation | Request | Success after transport unwrapping |
| --- | --- | --- |
| List | `GET /bands` | `200 { bands: BandSummary[] }` |
| Detail/members | `GET /bands/:bandId` | `200 { band: FullBand }` |
| Create | `POST /bands`, `{ name }` | `201 { band: FullBand }`, creator is leader |
| Rename | `PATCH /bands/:bandId`, `{ name }` | `200 { band: FullBand }`, freshly loaded active members |
| Add member | `POST /bands/:bandId/members`, `{ username }` | `201 { member: Member }` |
| Delete | `DELETE /bands/:bandId`, no body | `200 { message }` |

`BandSummary`: `bandId`, `name`, `isActive`, `createdAt`, `currentUserRole`. `FullBand` adds `members`. `Member`: `userId`, `username`, `firstName`, `lastName`, `role`. Recognize roles `leader` and `member`; IDs must be safe positive integers. Require the fields used by the UI and reject invalid collection/model shapes. Do not invent new constraints on opaque timestamps.

Band name: required string, trim before validation/submission, 1–50 JavaScript string characters. Username: required string, trim, 3–50 characters; lookup is case-insensitive, but submission need not lowercase it or prepend `@`. Do not invent character restrictions or uniqueness rules. Use the established blur-then-edit and submit validation timing. Focus the first invalid field; associate messages with controls. Backend validation remains authoritative, mapping recognized `details[].field` to controls and other details to a form error.

Common errors: `401 AUTHENTICATION_REQUIRED`, `400 VALIDATION_ERROR`, unexpected/network/malformed-response failure. Targeted reads/mutations can return `404 BAND_NOT_FOUND`; leader mutations can return `403 LEADER_REQUIRED`. Add also returns `404 USER_NOT_FOUND` and `409 USER_ALREADY_IN_BAND`. Although band endpoints have no dedicated rate limiter, honor shared non-retry behavior for `TOO_MANY_ATTEMPTS` if received. Route/body validation may precede leader authorization; do not assume every non-leader mutation receives `403`.

## 7. Freshness, cache consistency, and uncertain outcomes

Use conservative existing query retries: at most one retry for transient read failures; none for authentication, authorization, validation, missing-resource, or rate-limit responses. Never automatically retry mutations.

Band list and active detail queries are stale immediately and refetch on mount and when the app tab becomes visible again. Override focus behavior for band queries only; do not change session bootstrap or unrelated query defaults. Background refresh retains useful data and does not replace edited form inputs. No polling, desktop Refresh bands button, or pull-to-refresh. Resource-specific Retry/Check again remains available for failures, including a failed background refresh notice.

On confirmed mutations, cancel/guard older affected reads, apply validated response data or remove deleted data, and invalidate/refetch affected active queries. Reconciliation failures must not turn an already confirmed mutation into an apparent failed submission. Prevent stale in-flight reads from resurrecting deleted bands, erasing successful additions, reverting names, or repopulating a previous session.

| Mutation | Affected data |
| --- | --- |
| Create | Insert returned summary/detail, refresh list, remove zero-band state. |
| Add | Merge member by ID into detail and revalidate detail; list has no member count to update. |
| Rename | Replace detail, update summary/name ordering, invalidate list; later derived datebook labels must derive from refreshed band identity. |
| Delete / inaccessible band | Cancel/remove that band's detail and all associated private band resources; remove summary and refresh list; clear route context. |
| Permission change | Refresh list and detail together; do not let a stale summary re-enable denied controls. |

For network, unexpected server, or malformed-success failures, the server may already have applied the mutation. Preserve input, show `We couldn’t confirm whether that change was saved. We’ll check the latest information before you try again.`, and run the relevant read before offering another submission. While checking, prevent mutation submission. If the read fails, show Check again and allow safe navigation with the usual dirty warning; do not replay the write.

Reconciliation is operation-specific:

- **Create:** Refresh the band list and offer navigation to existing bands for inspection. Names are not unique and the API has no idempotency key, so a matching name or newly observed band cannot prove which request succeeded. Never auto-select a presumed result, auto-navigate, or claim confirmed creation. After a successful check, an explicit Create again action may be offered with text that another band could be created; retain the entered name.
- **Add:** Refresh full band membership. If a case-insensitive username match exists, report `That person is now in the band` without claiming this request added them; update the list and allow the user to clear the input and continue. If absent, permit an explicit retry. Never duplicate a member row.
- **Rename:** Refresh full band. If the server name matches the normalized requested name, report that the current band name matches and reset the form baseline; otherwise show the current server name alongside the preserved draft and allow an explicit retry.
- **Delete:** Refresh the targeted band/list. If it is now unavailable, clear its context and offer home, saying it is no longer available rather than claiming this request deleted it. If still accessible, retain confirmation/retry access. A second delete requires explicit confirmation.

No successful read proves a timed-out write cannot finish later. Retried operations remain deliberate user actions, never automated guarantees of exactly-once execution.

## 8. Recovery and unsaved work

Initial list loading keeps shell navigation and Logout usable. An empty list is distinct from a loading/error state. Initial failure shows contextual Retry, not zero-band guidance. Detail loading keeps the global shell available and hides role-dependent controls. Background errors retain useful stale data with contextual recovery.

`BAND_NOT_FOUND` clears stale context/resources and presents `This band is no longer available` with a home link. Do not distinguish deleted, nonexistent, or inaccessible bands. A role failure immediately suppresses denied management controls while list/detail refresh. If confirmed member, replacement-navigate from Settings to Schedule and explain the permission change; on Members close the management form and explain it. If role refresh fails, keep management suppressed and offer Retry. If access disappeared, use unavailable-band recovery.

Dirty means a name differs from its baseline or an add-member field contains unsubmitted input. Opening a form alone is not dirty; a successful add clears dirty state. Normal links, band switching, Back/Forward, and Cancel ask `Discard your unsaved changes?` with Keep editing and Discard changes. Keep editing retains input/focus/context; Discard proceeds once to the intended destination. Prevent navigation races during an in-flight mutation; show progress and wait for its result before resuming user navigation. Native unload protection is best effort when dirty/pending.

Session expiration bypasses dirty warnings, clears private state/unsaved values, and uses Phase 1's safe destination restoration. Revoked access and confirmed destructive success also bypass warnings that would trap the user on inaccessible content. Do not persist drafts across sessions or replay interrupted actions after authentication.

## 9. Acceptance criteria

- Zero-band users can create or share their username; users with bands have alphabetical links and creation access.
- Every global band selection opens Schedule for both roles, including when leaving Settings; its temporary content never implies there are no stored events.
- Creation returns a leader-owned band, updates all affected views, and opens Members with its form once; Cancel returns to its validated origin.
- Members display full name/username with leaders first, then name order; ordinary members never receive leader controls or usable Settings UI.
- Sequential additions work without reopening the form, update immediately, keep keyboard focus, preserve correctable failures, and prevent duplicates/concurrent requests.
- Rename and Delete handle validation, confirmation, permissions, cache updates, and success/error navigation correctly.
- Dirty-form warnings cover navigation and cancellation without obstructing session or permission recovery.
- Tab return refreshes band data without an ordinary Refresh button, polling, or overwriting edits.
- Ambiguous outcomes reconcile safely without automatic mutation retries or claiming duplicate names prove creation.
- Responsive navigation, labels, focus, dialogs, keyboard operation, long names, and narrow widths work without advanced mobile features.

## 10. Verification and delivery

Use existing Vitest/React Testing Library seams with the real router, Query provider, session boundary, and mocked HTTP boundary. Test observable journeys rather than component internals or static snapshots. Focus pure tests on new validation/model/sorting behavior only where integration tests do not already prove it.

Each ticket includes loading/failure/access cases, focused automated tests, lint/build, and applicable manual keyboard/narrow-width checks. Test at least two bands with different roles, multiple sequential additions, duplicate names, direct routes, safe auth restoration, dirty Back navigation, list/detail refetch races, permission changes, and expiration during requests. Cover uncertain writes and failed reconciliation, not just definitive backend validation failures.

Before phase completion run lint, the complete existing and new Vitest suite, and a production build. Perform browser checks against the running backend with separate leader/member accounts: create → add multiple existing users → member sees the band after tab return → inspect members → switch bands → rename → delete. Verify Settings is gated by direct URL and navigation, dirty form Keep/Discard, menu keyboard/focus, 320px-width and desktop layouts, browser refresh/history, and deterministic recovery. Simulate expired sessions and unavailable resources where needed. Record evidence and any unavailable manual checks; do not mark the phase complete based only on mocked tests. New Playwright infrastructure is not required for this phase.

Implement the ticket sequence in dependency order. No Phase 2 code has been implemented by this specification.

## 11. Decisions and deferred work

Discovery is complete for this scope. The following replace earlier suggestions: band switching always opens Schedule; Schedule uses an explicit temporary placeholder instead of redirecting to Members; pull-to-refresh is deferred. Creation still opens Members with the add form once. No ordinary desktop Refresh bands button is added; error-specific Retry remains.

The route `/bands/:bandId/settings` and `/bands/new` extend the master route map. Phase 3 replaces Schedule's placeholder with real events; Phase 4 replaces interim home with the datebook. Account navigation, final styling, and advanced mobile behavior remain later work. Query timing, deterministic sort tie-breakers, and ambiguous-write mechanics above are implementation defaults resolving the agreed behavior, not additional backend capabilities.
