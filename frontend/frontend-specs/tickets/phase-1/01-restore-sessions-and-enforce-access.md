# Restore authenticated sessions and enforce route access

> **Status:** Complete (2026-09-03)

## User/system outcome

Returning users enter the correct authenticated state without seeing the wrong screen, signed-out users are directed to authentication, and temporary backend failures do not masquerade as Logout.

## Context

This is the first Phase 1 ticket. Phase 0 provides the API client, current-user normalizer, Query Client, provider boundary, and route map, but intentionally has no session state or access enforcement.

## In scope

- Add React Testing Library, `user-event`, and jsdom with a focused component-test setup.
- Add the session boundary and its checking, authenticated, signed-out, and unrecovered failure behavior.
- Bootstrap through `GET /users/me` once per full application load.
- Add the full-page loading and connection-failure/Retry states.
- Add protected and signed-out-only route boundaries without an auth-state flash.
- Add shared validation and router-state transport for safe internal destinations.
- Preserve path, query, and hash for recognized protected routes.
- Use replacement navigation for access redirects.
- Keep authenticated unfinished feature routes replacement-redirecting to `/`.
- Keep the minimal catch-all publicly reachable.
- Establish deterministic private-query clearing that later tickets and features can call.

## Out of scope

- Login and Registration forms or mutations.
- Logout controls or mutation.
- Authenticated feature screens or populated navigation.
- Polling, focus refetch, or cross-tab synchronization.
- Playwright and final authored styling.

## Routes and access

- `/login` and `/register` become signed-out-only route slots; placeholder contents are sufficient until their tickets.
- `/`, `/bands/:bandId`, `/bands/:bandId/members`, `/bands/:bandId/events/new`, `/bands/:bandId/events/:eventId`, `/bands/:bandId/events/:eventId/edit`, and `/account` require authentication.
- Signed-out protected entry replacement-redirects to `/login` with a validated restoration candidate.
- Authenticated entry to `/login` or `/register` replacement-redirects to `/`.
- Authenticated entry to an unfinished protected feature route replacement-redirects to `/`.
- `/*` remains a public minimal not-found route.

## API contract

Call `GET /users/me` with the shared credentialed client. Normalize its successful user through the Phase 0 current-user normalizer.

- `200` establishes the authenticated current user.
- `401 AUTHENTICATION_REQUIRED` establishes signed-out state.
- Other failures leave authentication unknown and expose explicit Retry.

No cookie or token is read by frontend code.

## Experience and states

- Checking: full-page `Loading Bandos…` status with no protected or auth UI beneath it.
- Authenticated: render protected content and exclude signed-out-only content.
- Signed out: render auth routes or redirect protected routes.
- Connection failure: full-page `We couldn’t connect to Bandos` with Retry; do not show Login.
- Retry pending: prevent duplicate Retry calls and retain the full-page status context.
- Restoration validation rejects external, protocol-relative, auth, malformed, and unknown destinations and falls back to `/`.

## Acceptance criteria

- Initial bootstrap cannot flash Login or protected content.
- `/users/me` is called once on full load and is not polled or focus-refetched.
- A valid response establishes the normalized current user.
- `AUTHENTICATION_REQUIRED` establishes signed-out state; other errors remain distinguishable and recoverable.
- Retry calls `/users/me` and can move the application into either authenticated or signed-out state.
- Protected and signed-out-only routes enforce access with replacement history semantics.
- Safe destinations preserve path, search, and hash in router state; unsafe destinations resolve to `/`.
- The catch-all remains publicly reachable.
- Private-query clearing has focused proof and does not depend on enumerating future feature keys.
- Existing Phase 0 route, client, validation, lint, and build behavior remains intact.

## Verification

- Component tests cover checking, authenticated, signed-out, failure, Retry, and absence of content flashes.
- Routing tests cover all access boundaries and representative safe/unsafe destinations.
- Unit tests cover destination validation as a pure function.
- Tests cover private-query clearing without discarding public configuration unnecessarily.
- Manually check refresh/direct entry, Back/Forward behavior, Retry, keyboard operation, and narrow-width full-page states.
- Run lint, Vitest, and the production build.

## Dependencies

- Completed Phase 0 frontend foundation.
- Implemented `GET /users/me` backend contract.

## Decisions and follow-ups

Login, Registration, post-auth identity retrieval, Logout, and expiration notices are implemented by the dependent tickets. The session boundary must expose narrow operations for those outcomes without becoming a general client-state store.
