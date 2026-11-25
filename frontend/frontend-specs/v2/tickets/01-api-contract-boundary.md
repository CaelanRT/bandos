# FE-V2-01 — Preserve v2 models and structured API errors

> **Status:** Completed
> **Dependencies:** None; delivered backend v2 is the baseline.
> **Created:** 25 November 2026

## Objective

Extend the credentialed boundary and narrow resource parsers; keep JavaScript/JSX and existing query conventions. Add poll and preference read/write adapters for the delivered endpoints without inventing new endpoints or sending read-only fields back in requests.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 3, 8–9; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 2, 4–6, 9–10; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). Follow the repository ticket workflow; use mounted serializers and strict validators to resolve payload details.

## Current implementation and scope

The existing adapters discard v2 fields: `api/currentUser.js`, `api/session.js`, `features/bands/api.js`, and `features/events/api.js`. `api/client.js` accepts only array-shaped error details and drops error.reason. Poll/preference adapters do not exist.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/api/client.js](../../../../frontend/src/api/client.js)
- [frontend/src/api/currentUser.js](../../../../frontend/src/api/currentUser.js)
- [frontend/src/features/bands/api.js](../../../../frontend/src/features/bands/api.js)
- [frontend/src/features/events/api.js](../../../../frontend/src/features/events/api.js)
- [backend/controllers/event.controller.js](../../../../backend/controllers/event.controller.js)
- [backend/controllers/poll.controller.js](../../../../backend/controllers/poll.controller.js)
- [backend/middleware/validate-poll.js](../../../../backend/middleware/validate-poll.js)
- [backend/controllers/user.controller.js](../../../../backend/controllers/user.controller.js)

## Acceptance criteria

- [x] Normalize user snake_case once, retaining version, emailVerifiedAt and pendingEmail; retain the returned session access and all three timestamps separately from the user.
- [x] Preserve band version, member instrumentIds, catalog, instrumentation and nullable defaultLineup with applicability/reasons. Preserve event version, visibility, startsAt/endsAt, slots, immutable invitation IDs, myInvitationId, canManage/canRespond and conditionally present declineReason.
- [x] Parse poll summaries separately from details; preserve options/revisions, musician slots, row versions (including zero), answers, state, finalizedEventId and permission hints. Preserve preference version and all seven booleans.
- [x] Accept documented dotted-field detail arrays and LEADERSHIP_TRANSFER_REQUIRED details.bands objects; retain optional error.reason and existing Retry-After deadlines. Invalid responses remain recoverable errors.
- [x] Keep /api/v1, credentialed JSON, strict positive safe-integer IDs and endpoint-specific status/envelope checks. Member/default deletion consumes {band}; band/event/account deletion consumes {message}. Auth envelopes use {data:{user,session}}.
- [x] Provide exact endpoint-specific write shapes; do not serialize entire read models, option revisions into composition writes, invitation objects into slots, or unsupported confirmation fields.

## Verification

Extend apiClient/currentUser/eventBoundary tests and add focused band/poll/preference boundary cases: conditional private field omission, nulls, version zero, object error details, invalid IDs and exact deletion envelopes. Compare fixtures with backend serializers and strict validators.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Follow the sequence’s definition of done and record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.

## Implementation verification

- Merged PR: [#112](https://github.com/CaelanRT/bandos/pull/112)
- `npm test -- --reporter=dot` from `frontend/`: **PASS**, 34 files / 440 tests.
- `npm run lint`: **PASS**, existing `EditEvent.jsx:41` warning.
- `VITE_API_ORIGIN=/ npm run build`: **PASS**.
- `git diff --check`: **PASS**.
- Independent `review-ticket` review: **PASS**, all six acceptance criteria passed; no blockers. Reviewer independently ran 42 focused tests, lint, build, and staged whitespace checks.

Non-blocking follow-up for FE-V2-11: accept the backend's `DEFAULT_LINEUP_INVALID` reason-array details when implementing default-lineup repair. No backend/runtime integration or browser smoke check is claimed by this boundary ticket.

## Completion

PR [#112](https://github.com/CaelanRT/bandos/pull/112) merged into `main` on 25 November 2026 (merge commit `90b667952a5f03c9a2af6fb90ab3d07ff68f94ef`). FE-V2-01 is completed.
