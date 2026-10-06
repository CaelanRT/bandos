# Serve the built frontend and same-origin API through Express

> **Status:** Implemented — independent review passed; Draft PR pending

> **Dependencies:** No implementation dependency; agree middleware boundaries with 01–02. Can proceed alongside runtime work.

## Objective

Serve the generated frontend and existing API from one Express origin, with correct SPA routing and a frontend build reusable across environments.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 2, 3 (static serving/request boundaries and same-origin configuration), 6 candidate 2, and 7 criteria 3–5. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

Express currently ends all unmatched requests with JSON not-found and has global session middleware. The frontend uses browser routing; buildApiBaseUrl already maps / to /api/v1 but that value lacks explicit documentation/coverage.

## Scope

- Serve only generated frontend files from an absolute build path and define API-only local behavior when that build is absent.
- Put the API JSON not-found boundary before an Express 5-compatible GET/HEAD navigation fallback.
- Document/test VITE_API_ORIGIN=/, static cache/content/security headers, and static independence from sessions/database.

## Out of Scope

- Docker image/Compose, runtime config injection, separate frontend image, per-environment frontend rebuilds, and UI/product changes.

## Acceptance Criteria

- [x] Built frontend HTML, scripts, styles, and local fonts are served with correct content types without exposing backend source or the repository root.
- [x] Direct GET/HEAD navigation to nested and unknown UI routes receives index.html so React Router can handle them; missing assets, unknown API routes, and inappropriate methods receive real errors rather than SPA HTML.
- [x] Unknown /api/v1 routes keep the JSON NOT_FOUND boundary and existing API/authentication contracts.
- [x] Fingerprint assets have immutable caching; index.html and fallback HTML avoid long-lived caching. Helmet covers HTML/assets/API and CSP permits the built scripts/styles/fonts and same-origin API calls.
- [x] Static requests neither create nor refresh sessions nor query the database, including with an existing cookie and during a database outage.
- [x] VITE_API_ORIGIN=/ produces relative /api/v1 client requests with credentials. Missing configuration still fails; absolute origins and local Vite/API development remain supported.
- [x] API-only local startup without generated assets has documented behavior; packaged deployment is required to include the frontend build.

## Testing Strategy

### Unit Tests

- Extend [config.test.js](../../../frontend/src/__tests__/config.test.js) for / and retain missing/absolute-origin cases.

### Integration Tests

- Extend [apiClient.test.js](../../../frontend/src/__tests__/apiClient.test.js) for relative URLs with credentials; add focused Express routing/header tests for deep links, API errors, missing assets, methods, cache headers, and static/session/database separation.

### Manual / Smoke Verification

- Build with / and browse through Express: deep-link refresh, unknown UI route, local fonts, API requests, and CSP console checks. Verify existing Vite/API-only workflow.

### Explicitly Not Required

- Runtime browser configuration injection, CDN support, or a new UI design.

## Implementation Notes

- Code: [app.js](../../../backend/app.js), [errors.js](../../../backend/middleware/errors.js), [routes.jsx](../../../frontend/src/app/routes.jsx), [config.js](../../../frontend/src/config.js), [client.js](../../../frontend/src/api/client.js), [vite.config.js](../../../frontend/vite.config.js), [frontend example](../../../frontend/.env.example), [README](../../../frontend/README.md).
- Preserve [frontend foundations sections 4–5](../../../frontend/frontend-specs/01-phase-0-foundations.md) and [API contract](../../../backend/backend-specs/00-api-contract.md). / is an origin configuration value; do not set it to /api/v1.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [x] Existing relevant tests pass; no known regression exists in touched behavior.
- [x] Run frontend `npm test`, `npm run lint`, and `npm run build` with documented nonsecret configuration; run focused backend checks for middleware changes and `git diff --check`. No separate typecheck script currently exists.
- [x] No unnecessary out-of-scope work is introduced.
- [ ] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Ticket 04 copies the built files to the agreed absolute runtime location.

## Implementation Verification — 2026-10-06

- Clean `npm ci --no-audit --no-fund` in frontend and backend passed with Node 20.20.2.
- `npm test -- --maxWorkers=2`: 33 files, 429 tests passed. The initial unrestricted run had one timeout in the unchanged sessionLifecycle test; the complete rerun passed without modifying that test.
- `npm run lint`: passed with the existing EditEvent.jsx set-state-in-effect warning.
- `VITE_API_ORIGIN=/ npm run build`: passed; generated JS, CSS and local TTF fonts verified through Express.
- `node --test backend/test/frontend.integration.test.js backend/test/runtime-config.test.js`: six tests passed. Checks cover real production app routing, GET/HEAD, JSON API errors, unsupported methods, missing assets/source protection, cache/security headers, signed-cookie static independence under failing DB queries, and missing-build behavior.
- `node --check backend/app.js`, `node --check backend/frontend.js`, and `git diff --check`: passed.
- Chromium through a disposable localhost HTTPS edge: nested-route direct entry and refresh redirect to Login, unknown UI route renders Page not found, local fonts load, API requests target the same HTTPS origin, and no CSP violations or browser runtime errors occurred.
- Separate Vite/API-only browser check: with generated assets temporarily absent, backend logged API-only mode, UI request returned 404, unauthenticated identity request returned 401, and Vite deep-link entry/refresh worked using an absolute localhost API origin. Generated assets were restored afterward.
- No real database, container, AWS deployment or product-flow verification is claimed by this ticket; those follow in the designated tickets.

Independent `review-ticket` review: **PASS**. All seven acceptance criteria passed, with no blocking or non-blocking findings. Reviewer independently reran six backend tests, 23 frontend configuration/client tests, syntax checks and `git diff --check`.
