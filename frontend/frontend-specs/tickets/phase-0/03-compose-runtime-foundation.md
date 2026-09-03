# Render the application through stable providers and routes

> **Status:** Complete (2026-09-03)

## User/system outcome

The application renders through its real router and server-state provider, supports durable route entry, and gives later features a semantic shell without restructuring the root.

## Context

This Phase 0 system outcome proves provider composition and the approved URL map while avoiding premature feature behavior.

## In scope

- One application provider composition boundary.
- One configured TanStack Query client.
- Agreed query freshness, focus-refetch, and retry policy.
- `createBrowserRouter` route-object configuration for every approved path.
- `/` minimal shell.
- Replacement redirects from recognized unfinished feature routes to `/`.
- Minimal catch-all result for unknown routes.
- Skip link and semantic header, navigation, and main landmarks.
- Only CSS required for skip-link operation, visible focus, or narrow-width safety.
- Manual route, refresh, keyboard, and viewport verification.

## Out of scope

- Session provider and authentication bootstrap.
- Protected or signed-out-only routing.
- Login, Registration, band, event, datebook, or account screens.
- Real navigation contents or responsive band switching.
- Design tokens and authored visual styling.
- Automated component or browser route tests.

## Routes and access

All approved master-plan paths are defined. `/` renders the shell. Recognized unfinished paths replacement-redirect to `/`. `/*` renders a minimal catch-all result. No access control exists until Phase 1.

## API contract

No endpoints are called. The provider boundary makes the Query Client available for later features.

## Experience and states

- The root has semantic landmarks and keyboard-accessible skip navigation.
- Recognized unfinished destinations do not display fake screens or add redirect entries to browser history.
- Unknown URLs do not silently masquerade as the home route.
- No remote loading, empty, or failure states exist in this ticket.

## Acceptance criteria

- The application renders through `RouterProvider` and the Query Client provider.
- Queries are immediately stale and do not refetch on window focus by default.
- Retryable query errors retry at most once.
- Authentication, authorization, validation, not-found, and rate-limit failures do not retry.
- Mutations do not retry.
- Every approved route is represented in the route map.
- Recognized unfinished routes replace-redirect to `/`.
- The catch-all handles unknown paths.
- Keyboard focus, skip navigation, and narrow-width rendering work with minimal styling.
- Lint, tests, and build pass.

## Verification

- Unit-test retry-policy classification as a pure function.
- Manually enter and refresh `/`.
- Directly enter every recognized route and verify its redirect and history behavior.
- Enter an unknown URL and verify the catch-all.
- Use only the keyboard to reach and activate the skip link.
- Inspect a narrow mobile viewport and a desktop width.
- Run lint, Vitest, and the production build.

## Dependencies

- Establish a repeatable frontend development foundation.
- Provide a safe, normalized backend API boundary, so retry classification uses the stable `ApiError` contract.

## Decisions and follow-ups

Phase 1 adds session behavior and component-level route tests. Phase 2 authors populated responsive navigation. Phase 6 owns visual implementation.

