# Bandos frontend

The Bandos web client is a React 19 application built with Vite. This repository currently contains the minimal frontend foundation; user-facing features are added in later phases.

## Requirements

- A current Node.js release compatible with Vite 8 (Node.js 20.19+ or 22.12+)
- npm
- A running Bandos backend for browser use

## Setup

1. Install the locked dependencies:

   ```sh
   npm ci
   ```

2. Create the local environment file:

   ```sh
   cp .env.example .env
   ```

3. Set `VITE_API_ORIGIN` in `.env` to the backend origin. Use an origin such as `http://localhost:3000`; do not include `/api/v1`, credentials, or secrets. Bandos appends `/api/v1` itself.

4. Start the development server:

   ```sh
   npm run dev
   ```

The application stops at startup with an actionable error when `VITE_API_ORIGIN` is absent. Unit tests inject configuration and do not require a local `.env` file.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates the production bundle in `dist/`.
- `npm run preview` serves the production bundle locally for verification.
- `npm run lint` checks the source with Oxlint.
- `npm test` runs the Vitest suite once and exits with its result, making it suitable for local use and CI.

Run the complete automated verification with:

```sh
npm run lint
npm test
npm run build
```

## Browser and hosting support

Bandos supports the current major evergreen releases of Chrome, Edge, Firefox, and Safari, including current Chrome on Android and Safari on iOS.

Vite provides history fallback during development and preview. A production host must serve `index.html` for unknown document paths so that direct visits and refreshes of client-side routes work. Configure that SPA fallback in the selected hosting platform.

## Validation convention

Shared validators in `src/utils/validation.js` are pure functions that return a displayable message when a value fails and `undefined` when it passes. `validateFields` composes those rules into a field-error map such as { email: 'Enter a valid email.' }; an empty object means validation passed.

Validators only determine whether submitted values are valid. Forms own touched state, submission timing, pending behavior, and error presentation. Backend validation remains authoritative, and feature-level adapters will map applicable backend details into the same field-error shape when those forms are implemented.

## Session and query-data conventions

The application restores its server-owned cookie session with `GET /users/me`
before rendering route content. A missing session enables `/login` and
`/register`; other failures retain an unknown session state and provide an
explicit Retry action. Protected deep links are carried only in React Router
state after validation as recognized internal application destinations.

Authenticated TanStack Query keys must begin with `private`, for example
`['private', 'bands']`. Public configuration uses a distinct prefix such as
`['public', 'configuration']`. This convention allows session transitions to
remove all private server data without discarding safe public configuration.

## Login flow

The Login form validates credentials after blur and on submission, normalizes
only the email address, and sends the password unchanged. Authentication is not
complete until the follow-up `GET /users/me` supplies normalized identity.
Transient identity failures use the full-page Retry state and retry only the
identity request; validated protected destinations remain in router state.

## Registration flow

The Registration form collects first name, last name, username, email, and
password. Validation runs after blur and on submission, using the backend’s
length limits. Non-password fields are trimmed, email is lowercased, and the
password is sent unchanged. Login and Registration share the password visibility
control and preserve validated destinations when switching forms.

Account creation submits once with no automatic retry. Conflicts use a general
username-or-email message; rate limits keep fields editable and honor a valid
server retry deadline without a countdown. A successful registration retrieves
identity through `GET /users/me`. Connection recovery retries only that identity
request, never account creation; an absent session directs the user to log in.

Automated registration tests cover validation, accessible hints and controls,
pending state, request normalization, backend failures, retry timing, destination
restoration, history navigation, and identity-only recovery. Real-browser checks
for autofill/password managers, narrow layouts, and refresh during recovery remain
manual verification tasks.
