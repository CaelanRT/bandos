# Phase 0 — Frontend Foundations

> **Status:** Ready for ticketing
> **Phase outcome:** A stable technical skeleton supports user-facing slices.
> **Discovery source:** Phase 0 Grill Me session, 2026-09-02
> **Governing plan:** [`00-frontend-implementation-plan.md`](00-frontend-implementation-plan.md)
> **Backend contract:** [`../../backend/backend-specs/00-api-contract.md`](../../backend/backend-specs/00-api-contract.md)

## 1. Goal

Replace the Vite demonstration with a small, verified React foundation that later feature tickets can use without reinventing routing, provider composition, API transport, error parsing, response normalization, or validation conventions.

The foundation must run in current major evergreen desktop and mobile browsers. It remains deliberately non-feature-bearing and essentially unstyled.

## 2. Non-goals

Phase 0 does not implement:

- session bootstrap or session state;
- Login, Registration, or Logout behavior;
- protected or signed-out-only route enforcement;
- feature screens, forms, band navigation, or remote feature queries;
- notifications or feature-specific recovery;
- authentication validation rules;
- Playwright, React Testing Library, `user-event`, or a browser-component test harness;
- design tokens, authored typography, responsive compositions, or the final design language.

Those responsibilities remain in their assigned later phases. Phase 0 route entries must not imply that unfinished capabilities work.

## 3. Runtime and dependencies

The application remains React 19, Vite, vanilla JavaScript, and JSX. Do not introduce TypeScript or JSDoc model contracts.

Add only the dependencies needed by this phase:

- React Router, using `createBrowserRouter` and `RouterProvider`;
- TanStack Query;
- Vitest.

Vitest runs in its default non-browser environment for pure modules. Browser and component testing are introduced in Phase 1. Tests live under `src/__tests__/`, organized by the responsibility they verify.

Supported browsers are the current major evergreen releases of Chrome, Edge, Firefox, and Safari, including current mobile Safari and Chrome.

## 4. Environment configuration

The backend origin is provided by `VITE_API_ORIGIN`. The shared API client appends `/api/v1`; callers pass endpoint paths beneath that base.

- Deployed application builds require `VITE_API_ORIGIN`.
- Local development uses a documented localhost value supplied through environment configuration.
- Tests may inject or replace configuration without requiring a developer `.env` file.
- Missing configuration outside tests fails at application startup with a clear configuration error.
- Joining the origin, API prefix, and endpoint must not produce accidental duplicate slashes.

Track an `.env.example` that documents the variable without containing credentials or secrets. Update the README with installation, development, build, lint, test, and configuration instructions.

## 5. API boundary

### Request client

All backend calls go through one shared client. It must:

- build URLs from the configured origin plus `/api/v1`;
- send `credentials: 'include'` on every request;
- accept recognized request options without exposing cookie or token handling to features;
- JSON-encode defined request bodies and set `Content-Type: application/json`;
- parse successful `{ data }` envelopes;
- explicitly support the Login and Registration top-level `{ message }` success exception without treating that message as identity;
- tolerate valid empty success bodies where applicable;
- avoid mutation-retry behavior at the transport layer.

The frontend never reads, stores, or infers an authentication token. The `bandos.sid` cookie remains HttpOnly and server-owned.

### Errors

Handled failures become an `ApiError` containing:

- HTTP status when available;
- stable error `code`;
- displayable `message`;
- optional field `details` in the backend's `{ field, message }[]` shape;
- an original cause only when useful for diagnostics, not presentation.

Standard backend error envelopes retain their code, message, and valid field details. Network failures become controlled API errors. Invalid JSON, invalid envelopes, and otherwise malformed responses become an `ApiError` with the frontend-defined code `INVALID_API_RESPONSE`; raw parser messages must not be presented to users.

### Normalization

The request client remains shape-agnostic. Endpoint modules own explicit normalizers rather than recursively camel-casing arbitrary responses.

Phase 0 supplies and tests the current-user normalizer:

```text
user_id     -> userId
first_name  -> firstName
last_name   -> lastName
is_active   -> isActive
created_at  -> createdAt
```

`username`, `email`, and `plan` retain their names. A malformed current-user object must produce a controlled invalid-response error rather than leaking an unsafe partial model into the application.

## 6. Server-state defaults

Create one application `QueryClient` through the provider composition boundary.

- Queries are stale immediately by default.
- Refetch on window focus is disabled for the MVP baseline.
- Retry a failed query at most once when the failure could reasonably be transient.
- Do not retry authentication, authorization, validation, not-found, rate-limit, or other clearly non-retryable API errors.
- Mutations never retry automatically.
- Feature specifications may override freshness or retry behavior when justified.

The retry policy should branch on stable error status/code rather than display text.

## 7. Providers, routing, and shell

Compose application providers in one obvious root boundary, including TanStack Query and React Router. Phase 1 may add the session provider without restructuring feature screens.

Define the approved routes from the master plan:

```text
/
/login
/register
/bands/:bandId
/bands/:bandId/members
/bands/:bandId/events/new
/bands/:bandId/events/:eventId
/bands/:bandId/events/:eventId/edit
/account
/*
```

During Phase 0, `/` renders the minimal application shell. All recognized but unfinished feature routes redirect to `/` using replacement navigation so they do not add a useless history entry. The catch-all route provides a minimal not-found result; the authored not-found experience remains Phase 5 work.

The shell contains:

- a keyboard-operable skip link;
- semantic `header`, navigation, and `main` landmarks;
- a stable content target for the skip link;
- no fake band data, feature controls, or feature copy.

Only behaviorally necessary CSS is allowed. Browser defaults should remain intact. Add no design tokens or authored visual system. Any CSS required for the skip link, visible focus, or safe narrow-width rendering should be minimal and documented by purpose.

Browser refreshes and direct entry must resolve through the Vite history fallback in development and preview. Production hosting must be documented as requiring an SPA fallback to `index.html`; Phase 0 cannot configure an unknown deployment host.

## 8. Shared validation convention

Shared validators are pure functions. They return a field-error map:

```js
{
  email: 'Enter a valid email',
}
```

An empty object means validation passed. Forms will own touched state, submission timing, and presentation. Backend validation remains authoritative and its `details` are mapped into the same field-oriented form state at the feature layer.

Phase 0 implements and tests only genuinely generic primitives needed to prove this convention. It must not anticipate or encode Phase 1 credential policy.

## 9. States and failure behavior

Phase 0 has no user-facing remote-resource state. Its relevant failures are foundational:

- missing runtime configuration stops startup with an actionable developer error;
- malformed backend responses produce controlled `ApiError` instances;
- network failures do not masquerade as backend validation failures;
- recognized unfinished routes return to `/` deterministically;
- unknown routes render the minimal catch-all result.

Feature-specific loading, empty, authentication, permission, mutation, and recovery states are out of scope.

## 10. Acceptance criteria

1. The Vite demonstration UI and unused demo assets are removed.
2. The application starts through a single provider composition boundary and renders a semantic shell at `/`.
3. Every approved route is present; unfinished recognized routes replace-redirect to `/`, and an unknown route reaches the catch-all.
4. The API base is formed from `VITE_API_ORIGIN` and `/api/v1`, with missing deployed configuration rejected at startup.
5. Every request includes cookie credentials, and defined JSON bodies receive the correct header and encoding.
6. Standard data successes, authentication success exceptions, standard errors, network errors, and malformed responses are handled through documented contracts.
7. Current-user fields are explicitly normalized to the agreed camelCase model.
8. Query defaults implement the agreed freshness, focus-refetch, query-retry, and mutation-retry behavior.
9. Shared validation primitives prove the field-error-map convention without implementing authentication policy.
10. The README and `.env.example` let another developer configure and verify the foundation.
11. Lint, production build, and all Vitest tests pass.
12. Manual checks confirm direct route entry, refresh, redirect history behavior, catch-all behavior, keyboard focus, skip navigation, and usability at a narrow mobile viewport.

## 11. Verification

### Automated

Vitest covers, at minimum:

- API URL construction and credentials;
- JSON request handling;
- success-envelope and authentication-success parsing;
- backend `ApiError` normalization, including field details;
- network and malformed-response behavior;
- current-user normalization and malformed model rejection;
- retry-policy classification;
- representative shared validation primitives.

Because Phase 0 deliberately excludes a component/browser harness, provider rendering and route behavior are manual completion checks. Phase 1 introduces React Testing Library and converts appropriate routing/provider behavior into automated coverage.

### Manual

- Start the application with valid local API configuration.
- Confirm missing configuration produces the documented startup failure.
- Visit and refresh `/`.
- Directly visit every recognized unfinished route and confirm replacement redirection to `/`.
- Visit an unknown path and confirm the catch-all result.
- Navigate using only the keyboard and exercise the skip link.
- Check the shell at a narrow mobile viewport and at a desktop width.
- Run lint, build, and Vitest.

## 12. Decisions and deferred work

Confirmed during discovery:

- evergreen-browser support;
- required deployed `VITE_API_ORIGIN`;
- Vitest-only Phase 0 harness;
- plain JavaScript without JSDoc contracts;
- route-object router and full route map;
- one retry for transient query failures and no mutation retries;
- immediately stale queries with focus refetch disabled;
- semantic shell landmarks;
- dedicated `ApiError`;
- explicit endpoint normalization;
- centralized `src/__tests__/` placement;
- no foundation styling;
- recognized unfinished routes redirect to `/`;
- lint, build, automated unit tests, and manual route/accessibility checks are required.

Deferred to Phase 1 or later:

- exact session-provider implementation;
- component and browser test tooling;
- authenticated route guards and destination restoration;
- feature query freshness;
- feature validation and copy;
- authored navigation behavior and styling;
- production-host-specific SPA fallback configuration.

