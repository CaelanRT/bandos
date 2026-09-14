# Phase 2 verification record

Date: 2026-09-14. Ticket 06 implementation; Phase 2 remains in progress pending
human review and the outstanding full live-backend journey.

## Automated verification

- Full Vitest suite: 20 files, 305 tests passed, including 13 deletion tests.
- Oxlint: passed without warnings.
- Production Vite build: passed. No separate type-check script exists.
- `git diff --check`: passed.
- Scoped Impeccable detector: no findings.
- Deletion integration coverage uses the real router, session boundary and Query
  provider with mocked HTTP: named confirmation/Cancel focus and dismissal;
  bodyless single pending request; dirty rename and pending history protection;
  confirmed home replacement and consumed notice; late list/detail/resource reads;
  private resource cleanup with unrelated bands preserved; Back/deep-link access
  recovery; network/server/malformed-response reconciliation and failed rechecks;
  direct/uncertain 404; member gating, stale 403 permission recovery and 401 expiration.

## Native browser checks

Headless Chromium at 320px and 1280px, running Vite with mocked HTTP, passed:

- Native dialog Cancel focus, forward/backward keyboard navigation between actions,
  Escape dismissal and trigger focus restoration.
- 50-character unbroken band name with no horizontal document overflow.
- Dirty rename deletion without a second discard prompt; one bodyless DELETE.
- Home success notice, refresh without replay, and unavailable Settings deep link.
- No browser page errors. Screenshots captured at `/tmp/bandos-delete-320.png`
  and `/tmp/bandos-delete-1280.png` (ephemeral local evidence).

## Outstanding verification

The full live-backend leader/member journey has not run. Automatic approval review
rejected provisioning three persistent test accounts and a test band, membership
writes and deletion on the configured network service without explicit approval.
No live test mutations ran. Approval or provisioned test accounts are needed.

Still verify create → two sequential additions → member tab-return discovery →
member inspection → switching bands → rename → delete against the running backend,
with separate roles; also live dirty Keep/Discard and browser history/refresh,
menu keyboard/focus, expiration, and unavailable-resource recovery. Automated tests
cover these behavior areas but do not establish the complete live journey.

Native mobile browsers, Firefox/Safari, and the prior tickets’ remaining browser
follow-ups remain unverified here. Earlier ticket records retain their findings.
Do not mark Phase 2 complete solely on these mocked checks.
