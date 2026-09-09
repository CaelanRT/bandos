# Navigate bands through a responsive shared workspace

> **Status:** Ready for review
> **Draft PR:** [#24 — Implement Phase 2 band workspace navigation](https://github.com/CaelanRT/bandos/pull/24)
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

Authenticated users can find their bands and enter the correct workspace on desktop or mobile browser.

## Context

This first Phase 2 slice replaces the empty home and targeted band redirect with real band reads and navigation. It establishes the query/access boundary used by later tickets.

## In scope

- Validated list/detail adapters through authenticatedRequest and shared private query keys.
- Alphabetical band links, interim home/zero-band username guidance, responsive Menu, workspace role/context, and temporary Schedule.
- Global band selections always open Schedule; preserve Logout and existing authentication behavior.
- Tab-return/mount refresh, bounded read retries, list/detail loading and recovery, malformed-ID handling, and stale-response protection.

## Out of scope

Creation, Members implementation, Settings, event data, polling, pull-to-refresh, ordinary Refresh buttons, and final styling. Do not add dead links for dependent tickets.

## Routes and access

`/` and `/bands/:bandId` require authentication; targeted pages require current membership. Existing unfinished routes retain their current behavior until replaced.

## API contract

`GET /bands` → `{ bands: BandSummary[] }`; `GET /bands/:bandId` → `{ band: FullBand }`. Use specification sections 5–8 for normalization, private keys, `AUTHENTICATION_REQUIRED`, `VALIDATION_ERROR`, `BAND_NOT_FOUND`, and transient/malformed-response handling.

## Experience and states

Keep the shell usable during loading; distinguish empty from failure and retain useful data during background refresh. Schedule says schedules are not available yet and never claims zero events. Zero-band guidance shows the session username; creation controls arrive in ticket 03. Missing access clears context and offers home.

## Acceptance criteria

- Bands sort by name with deterministic ID ties; duplicate names retain distinct destinations.
- Switching from any existing section opens the selected band Schedule for either role.
- Detail is authoritative for current role; malformed data never grants leader access.
- Menu exposes correct expanded/focus behavior and closes on completed navigation.
- Tab return refreshes band queries without changing session bootstrap defaults.
- Missing/inaccessible bands and stale responses cannot retain or resurrect private context.

## Verification

Integration tests cover zero/list states, both roles, direct links and Login restoration, sorting, tab-return refresh, failure/Retry, unavailable bands, malformed IDs/payloads, and session expiration. Manually check menu, keyboard, long names, desktop/narrow width, direct refresh, and Back/Forward. Run lint, tests, build.

## Dependencies

None within Phase 2. Requires implemented Phases 0–1 and existing band read endpoints.

## Decisions and follow-ups

Future creation/member/settings tickets add working controls incrementally. Later dirty-form tickets must wrap these navigation paths. Full phase verification includes switching out of Settings.

## Implementation and verification — 2026-09-09

Implemented in draft PR #24 using local worktree `/tmp/bandos-phase2-01` and branch `feat/phase-2-band-workspaces`.

- Validated list/detail adapters, shared private keys, deterministic sorting, Home guidance, responsive Menu, and role-authoritative Schedule workspace.
- Band-only mount/tab-return refresh, bounded retries, initial/background failure recovery, invalid IDs, revoked access, and cancellation of stale reads. Unavailable detail stores a null result with no band identity or permissions; associated resource data is removed.
- 202 tests pass across the full suite, including 23 new band integration cases. The final menu history adjustment also passes all 23 band cases. Tests cover both roles, duplicate names, direct routes/Login restoration, menu focus/Escape, Back/Forward, refresh, payload validation, access loss, stale responses, and expiration.
- Lint, production build (`VITE_API_ORIGIN=http://localhost:3000`), and whitespace checks pass. UI mechanical detector reports no findings.
- Browser layout, real keyboard interaction, 320px/desktop long-name rendering, and live-backend leader/member checks remain **unverified**. No browser was installed; a temporary Chromium download was attempted but stopped because of slow transfer. Automated DOM coverage does not establish visual/browser validation. The phase-wide live-account journey remains outstanding.

Members links are intentionally deferred to ticket 02, consistent with this ticket's prohibition on dead dependent controls. Tickets 02–06 are not implemented by this change.
