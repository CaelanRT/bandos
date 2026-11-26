# FE-V2-02 — Gate verified access and classify session activity

> **Status:** Completed ([Merged PR #114](https://github.com/CaelanRT/bandos/pull/114))
> **Dependencies:** [FE-V2-01](01-api-contract-boundary.md)
> **Created:** 25 November 2026

## Objective

Extend the existing session boundary, guards, query/request activity handling and safe-destination helper. Keep server deadlines authoritative and retain responsive shell/navigation behavior.

## Source specification

[Frontend v2](../00-frontend-spec.md), sections 2–3, 8–9; [shared contract](../../../../backend/backend-specs/v2/00-shared-contract.md), sections 2–3, 9; [delivered runtime API](../../../../backend/backend-specs/v2/02-runtime-api.md). Follow the repository ticket workflow; use the shared/runtime contracts and mounted session middleware to resolve integration details.

## Current implementation and scope

SessionBoundary currently reduces /users/me to a user and treats every restored account as full access. RouteAccess has only authenticated/signed-out states; destination.js retains query strings. Feature queries enable focus refetches without any activity classification.

Start with these implementation/contract references; paths for new poll components are implementation choices:

- [frontend/src/app/SessionBoundary.jsx](../../../../frontend/src/app/SessionBoundary.jsx)
- [frontend/src/app/RouteAccess.jsx](../../../../frontend/src/app/RouteAccess.jsx)
- [frontend/src/app/SessionRoutes.jsx](../../../../frontend/src/app/SessionRoutes.jsx)
- [frontend/src/app/destination.js](../../../../frontend/src/app/destination.js)
- [frontend/src/app/queryClient.js](../../../../frontend/src/app/queryClient.js)
- [frontend/src/features/bands/queries.js](../../../../frontend/src/features/bands/queries.js)
- [backend/middleware/authenticate.js](../../../../backend/middleware/authenticate.js)
- [backend/utils/account-session.js](../../../../backend/utils/account-session.js)

## Acceptance criteria

- [x] Distinguish full, verification_required, signed-out, checking and recoverable bootstrap failure. Restricted users can identify, verify/resend, recover and logout, but never enter the protected shell or resource queries.
- [x] Recovery and all three token routes remain usable signed out, restricted or signed in; generic SignedOutOnlyRoute and SessionRoutes redirects must not intercept them. Ticket 04 supplies verification screens and ticket 05/06 the other forms.
- [x] Consume returned full/restricted auth sessions. Only AUTHENTICATION_REQUIRED ends protected sessions; INVALID_CREDENTIALS and CURRENT_PASSWORD_INCORRECT stay form errors. EMAIL_VERIFICATION_REQUIRED moves to restricted recovery.
- [x] Cancel or ignore old protected requests on identity/generation changes, clear private queries and sensitive drafts on session end, and preserve only a validated same-app protected destination. Never replay an unsaved mutation after login.
- [x] Validate poll return destinations as well as existing routes; reject external/protocol-relative/unsafe destinations and strip token-bearing query data. Tokens/passwords never enter return state or storage.
- [x] Only explicit successful navigation/load/Refresh GETs send X-bandos-activity: user. Bootstrap, focus, reconnect, invalidation/background reads omit it; no heartbeat, background poll or timer extends sessions. Prevent cached navigation from silently bypassing the intended explicit load policy.
- [x] Retain server authenticatedAt/idleExpiresAt/absoluteExpiresAt and useful expiry feedback, including generic missing-session expiry. Local timers are advisory; failed/expired writes require fresh login.

## Verification

Extend sessionAccess/sessionLifecycle/destination tests for restricted bootstrap/login, token-route reachability, safe poll deep links, delayed previous-identity responses, 401 distinctions and activity headers on navigation versus passive refetch. Use controlled deadlines; no real 24-hour waits.

Run relevant existing frontend tests, `npm run lint`, `npm run build` and `git diff --check` during implementation. Update affected v1 fixtures to exact v2 shapes without weakening behavioral assertions. Record actual commands/results; no runtime checks are claimed by this planned ticket.

## Out of scope

Backend feature reimplementation, infrastructure/deployment, v1 data migration, framework replacement and unrelated UI redesign. See the sequence for global exclusions; report any demonstrated contract defect with evidence before expanding this ticket.

## Implementation verification — 26 November 2026

- `npm test` from `frontend/`: **PASS**, 35 files / 465 tests. Includes restricted bootstrap/login, public recovery/token access, old-identity responses, expiry/error distinctions, safe poll destinations, cached navigation, and passive dependent-resource discovery.
- `npm run lint`: **PASS**, with the existing `EditEvent.jsx:41` `react(set-state-in-effect)` warning.
- `VITE_API_ORIGIN=http://localhost:3000 npm run build`: **PASS**.
- `git diff --check`: **PASS**.
- Required independent `review-ticket` review: **PASS**, no remaining findings. Reviewer also ran the focused session/activity/destination checks (4 files / 74 tests) successfully.

Recovery/token routes provide access scaffolding; the verification and security forms remain assigned to FE-V2-04–06. Browser/backend integrated verification was not run for this session-boundary ticket.
