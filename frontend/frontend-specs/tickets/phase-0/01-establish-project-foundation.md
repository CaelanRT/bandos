# Establish a repeatable frontend development foundation

> **Status:** Complete (2026-09-03)

## User/system outcome

Frontend contributors can install, configure, run, lint, test, and build the application through a documented, minimal toolchain.

## Context

This is the first Phase 0 ticket. The repository currently contains the Vite demonstration and lacks the routing, server-state, and test dependencies approved by the master plan.

## In scope

- Add React Router, TanStack Query, and Vitest.
- Add a test script suitable for local and CI execution.
- Remove unused Vite demonstration code and assets.
- Add centralized `src/__tests__/` test placement.
- Add `.env.example` for `VITE_API_ORIGIN`.
- Fail startup clearly when required API configuration is absent outside tests.
- Replace the README with Bandos-specific setup, configuration, scripts, supported-browser posture, and SPA-fallback guidance.

## Out of scope

- API request behavior beyond configuration helpers.
- Application providers and route definitions.
- React Testing Library, `user-event`, jsdom, or Playwright.
- Feature UI and authored styling.

## Routes and access

Not applicable. This ticket establishes the development/runtime boundary and does not add route behavior.

## API contract

The configured backend origin is combined with `/api/v1`. No endpoint is called by this ticket. Configuration contains no credentials or secrets.

## Experience and states

There is no feature experience. A missing `VITE_API_ORIGIN` outside tests produces an immediate, actionable developer-facing configuration failure rather than a later request failure.

## Acceptance criteria

- Only the approved Phase 0 dependencies are added.
- `npm test` runs Vitest once and exits with an appropriate status.
- The Vite demonstration code and unused assets no longer ship.
- `.env.example` documents `VITE_API_ORIGIN` without secrets.
- API base construction produces a single `/api/v1` boundary for origins with or without a trailing slash.
- Missing non-test configuration fails at startup with a clear message.
- README instructions allow a new contributor to run all project scripts.
- Lint, tests, and production build pass.

## Verification

- Unit-test configuration validation and base-URL construction.
- Run lint, Vitest, and the production build.
- Start once with valid configuration and once without it.
- Review the build output to confirm demo assets are absent.

## Dependencies

None.

## Decisions and follow-ups

Component/browser test tooling is deliberately deferred to Phase 1. Production hosting must provide an SPA fallback, but host-specific configuration waits until a host is selected.

