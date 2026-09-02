# Provide a safe, normalized backend API boundary

## User/system outcome

Future frontend features can call the implemented backend through one predictable client and receive usable data or controlled errors without reimplementing transport and parsing logic.

## Context

Phase 0 must prove the boundary required by every later user-facing slice. The backend uses credentialed cookie sessions, mostly `{ data }` successes, top-level authentication messages, and standard error envelopes.

## In scope

- Shared request client using the configured origin plus `/api/v1`.
- Cookie credentials on every request.
- JSON body encoding for defined bodies.
- Data-envelope, authentication-success, and valid empty-success handling.
- Dedicated `ApiError` with status, code, message, and optional field details.
- Controlled network and malformed-response errors.
- Frontend `INVALID_API_RESPONSE` classification.
- Explicit current-user response normalization and shape validation.
- Focused Vitest coverage.

## Out of scope

- Authentication workflows or calls made on application startup.
- Feature endpoint modules other than the current-user normalization boundary.
- Tokens, refresh logic, or cookie inspection.
- Query hooks, caching, notifications, or UI error presentation.

## Routes and access

Not applicable. This system-enabling ticket does not expose a frontend route.

## API contract

- Base: configured origin plus `/api/v1`.
- All requests: `credentials: 'include'`.
- Standard success: `{ data }`.
- Login/Registration exception: top-level `{ message }`.
- Standard failure: `{ error: { code, message, details? } }`.
- Current user: snake_case object from `GET /users/me`, normalized explicitly to camelCase.

## Experience and states

No direct UI is added. Consumers receive consistent success values or `ApiError` instances. Raw JSON parsing failures are never suitable display copy. Malformed current-user data cannot enter application state as a partial model.

## Acceptance criteria

- Every client request includes credentials.
- Defined request bodies are JSON-encoded with the correct content type.
- Standard and authentication-exception successes are parsed intentionally.
- Backend error codes/messages/details survive normalization when valid.
- Network failures and malformed responses produce controlled `ApiError` instances.
- Malformed success responses use `INVALID_API_RESPONSE`.
- Current-user fields normalize exactly as specified.
- The client has no token storage or inference.
- Focused tests pass with no real network dependency.

## Verification

- Vitest exercises request construction, success variants, empty success, backend failures, field details, network rejection, malformed JSON/envelopes, current-user normalization, and malformed-user rejection.
- Run lint, tests, and production build.

## Dependencies

- Establish a repeatable frontend development foundation.
- Implemented backend API contract.

## Decisions and follow-ups

Endpoint modules own explicit normalizers. Do not add recursive response-key conversion. Authentication identity retrieval remains a Phase 1 workflow.

