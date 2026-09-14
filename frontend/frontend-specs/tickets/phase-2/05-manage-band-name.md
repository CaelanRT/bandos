# Allow leaders to rename a band through protected Settings

> **Status:** Complete (2026-09-14)
> **Merged PR:** [#28 — Phase 2: Add protected band Settings and renaming](https://github.com/CaelanRT/bandos/pull/28)
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

## User/system outcome

Leaders can change a band name while members remain in a shared read-only workspace.

## Context

This slice introduces the Settings route and authoritative role gating, with Rename as its first working action.

## In scope

- Leader-only Settings link and guarded direct route.
- Prefilled name form, Save/Cancel, dirty warnings, validation, pending/error states, and same-page success.
- Immediate detail/navigation-name and ordering updates.
- Role revocation, background refresh without overwriting drafts, and uncertain rename reconciliation.

## Out of scope

Deletion until ticket 06, unsupported settings, role-changing UI, and final visual styling.

## Routes and access

`/bands/:bandId/settings` requires leader membership and safe auth-destination recognition. A confirmed member entering directly replacement-redirects to Schedule with a notice. Cancel opens Schedule; selecting any global band always opens that band Schedule even if the destination role is leader.

## API contract

`GET /bands/:bandId` supplies authoritative role/detail. `PATCH /bands/:bandId` with exactly `{ name }` (required trimmed 1–50 characters) → `200 { band }`; refresh detail/list as needed. Handle validation, `LEADER_REQUIRED`, unavailable band, authentication, and uncertain failures.

## Experience and states

Hide management while role is unknown. Save is disabled when unchanged/pending; preserve edited values on refresh/errors. Confirmed success stays on Settings and resets baseline with a notice. Stale-role failure suppresses controls before refresh; if refresh fails keep them suppressed and offer Retry.

## Acceptance criteria

- Settings is absent for members, including direct-entry protection with no management flash.
- New protected route restores safely after authentication.
- Save updates workspace/navigation names and alphabetical position without changing URLs.
- Cancel and band switching enforce dirty Keep/Discard; all band switches land on Schedule.
- Refetch does not overwrite an edited name; unknown role never re-enables denied controls.
- Uncertain rename checks the server name and preserves a conflicting draft for deliberate retry.

## Verification

Test both roles on links and direct URLs, loading-role gating, restore after Login, valid/invalid normalized requests, dirty Cancel/switch/Back, name reordering, stale-response handling, permission changes, expiration, and uncertain rename. Manually check keyboard, focus, long names, responsive layout. Run lint, tests, build.

## Dependencies

[03 — Create a band](03-create-a-band.md), for the reusable dirty-navigation boundary and band form conventions. Ticket 04 is not a blocker.

## Decisions and follow-ups

Ticket 06 adds a separate destructive section. Phase-level checks must verify switching out of Settings for both destination roles.


## Implementation and verification — 2026-09-10

- Added leader-only Settings navigation/direct routing with safe Login destination restoration. Members replacement-redirect to Schedule with a permission notice.
- Added prefilled Rename with trimmed 1–50 character validation, Save/Cancel, field and form errors, pending protection, and shared dirty navigation. Successful saves stay on Settings, update workspace/navigation names and sorting, and reset the baseline.
- Background refresh preserves drafts. Uncertain writes check the current name before another submission; matching names reset the baseline without attributing success, while conflicts preserve the draft for deliberate retry.
- Denied management stays suppressed through failed permission checks, background refresh, and route revisits. Permission Retry refreshes list/detail together. Unavailable bands and expired sessions clear context without trapping navigation; late reads/writes cannot undo confirmed names or repopulate a previous session.

Automated validation: `npm test` (292 tests across 19 files, including 24 new Settings integration cases), `npm run lint`, `npm run build`, and `git diff --check` passed. The UI detector reported no findings.

Chromium checks with mocked HTTP passed at 320px and 1280px: long-name wrapping/no horizontal overflow, keyboard and native dialog focus, Escape/Keep/Discard, mobile Menu focus, band switching to Schedule, Back navigation, member direct-route protection, confirmed Save, and uncertain conflict handling. Screenshots and the temporary runner were retained in `/tmp/bandos-settings-review` and `/tmp/bandos-settings-browser.mjs` for this session's review.

Live-backend leader/member checks and native refresh/unload/Forward checks remain outstanding. Mocked browser checks do not verify the live backend or other browser engines. Final styling, deletion (ticket 06), and the complete Phase 2 journey remain out of scope.

Independent ticket review: **PASS**, all six acceptance criteria passed with no findings. UI finish review: **ship**, no material findings within ticket scope. Documentation review confirmed the existing UI system is preserved.

Ticket 05 is complete following user acceptance and merge of [PR #28](https://github.com/CaelanRT/bandos/pull/28) on 2026-09-14. The verification follow-ups above remain outstanding; merge does not establish that the live-backend or remaining native-browser checks were performed. Ticket 06 and the complete Phase 2 journey remain outstanding.
