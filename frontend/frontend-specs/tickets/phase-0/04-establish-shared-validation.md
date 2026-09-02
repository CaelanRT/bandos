# Establish a reusable frontend validation contract

## User/system outcome

Later forms can share predictable, pure validation behavior and field-error state without coupling validation rules to components.

## Context

The master plan requires shared plain-JavaScript validation and consistent mapping of backend field errors. Phase 0 proves the convention without prematurely deciding authentication rules.

## In scope

- Define the field-error-map result convention.
- Add only genuinely generic validation primitives needed to demonstrate composition and normalized output.
- Keep validators pure and independent of React.
- Document ownership: validators produce errors; forms own touched/submitting behavior and presentation.
- Focused Vitest coverage.

## Out of scope

- Login or Registration validation policy.
- Profile, band, or event validation.
- Form components, touched state, submission handling, or error rendering.
- Replacing authoritative backend validation.

## Routes and access

Not applicable. This ticket adds no route or access behavior.

## API contract

Backend validation details use `{ field, message }[]`. Feature adapters will map applicable details into the agreed field-error map. Implementing those feature adapters is out of scope until their forms exist.

## Experience and states

Not directly user-visible. A validation pass produces an empty object; a failure produces field keys with displayable messages. Validators do not decide when errors become visible.

## Acceptance criteria

- Shared validators are plain, pure JavaScript functions.
- Validation results consistently use `{ [field]: message }` and `{}` for success.
- Generic primitives compose without React or browser dependencies.
- No authentication-specific policy is embedded in Phase 0.
- The convention and ownership boundaries are documented.
- Focused tests, lint, and build pass.

## Verification

- Vitest covers passing, failing, and composed primitive validation.
- Confirm tests run in the default non-browser environment.
- Run lint, tests, and production build.

## Dependencies

- Establish a repeatable frontend development foundation.

## Decisions and follow-ups

Phase 1 defines credential fields, messages, and backend-detail mapping through its focused discovery. New shared primitives should be added only after more than one feature genuinely needs them.

