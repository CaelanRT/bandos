# Navigate bands through a responsive shared workspace

> **Status:** Ready for implementation, subject to dependencies below
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
