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
