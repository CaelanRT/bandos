# Backend Scaffold Specification

## Architecture

Bandos uses CommonJS JavaScript, Express 5, and PostgreSQL through `pg` and parameterized SQL. Requests flow from route to controller to database. Shared middleware owns authentication, Zod validation, HTTP security, rate limiting, and error formatting. No ORM, Redis, or service layer is part of this MVP.

`app.js` constructs and exports the application and starts the server only when run directly. PostgreSQL stores both application data and sessions. The browser receives only an opaque `bandos.sid` cookie with `HttpOnly`, `SameSite=Lax`, a rolling seven-day expiry, and `Secure` in production. CORS allows credentials from the single configured frontend origin.

## HTTP contract

All endpoints are below `/api/v1`. Successful bodies use `{ "data": ... }`; failures use `{ "error": { "code", "message", "details"? } }`.

| Method | Endpoint | Authentication | Behavior |
| --- | --- | --- | --- |
| GET | `/health` | No | Checks the API and PostgreSQL; returns 200 or 503. |
| POST | `/auth/register` | No | Creates an active free-plan user, logs them in, and returns 201. |
| POST | `/auth/login` | No | Logs in by email and returns the sanitized user. |
| POST | `/auth/logout` | No | Destroys the current session and clears its cookie. |
| GET | `/users/me` | Yes | Returns the current active user. |
| PATCH | `/users/me` | Yes | Updates username, first name, and/or last name. |
| DELETE | `/users/me` | Yes | Confirms the password, deactivates the account, and destroys the session. |

Registration accepts `username`, `firstName`, `lastName`, `email`, and `password`. Email is normalized to lowercase; text is trimmed; unknown properties are rejected. Passwords must be at least eight characters and at most 72 UTF-8 bytes. PATCH accepts only profile fields and requires at least one. DELETE accepts only `password`.

User responses contain `id`, `username`, `firstName`, `lastName`, `email`, `plan`, `isActive`, and `createdAt`. They never contain password hashes. Invalid bodies return 400, absent authentication and invalid credentials return 401, missing routes return 404, unique-account conflicts return 409, rate limits return 429, and unexpected failures return 500. Login deliberately gives the same error for unknown email, incorrect password, and inactive account.

## Persistence and security

The baseline schema is intended for a disposable local database and can be reapplied after recreation. Usernames and emails are case-insensitively unique. Password hashes use bcrypt with 12 rounds by default and a `VARCHAR(255)` column. New users receive the free plan. Deletion sets `is_active` to false.

Sessions use `express-session` with `connect-pg-simple` and the PostgreSQL `session` table. Login and registration regenerate the session before assigning the user ID. Login is limited to ten attempts per IP per 15-minute window.

Required configuration is documented in `.env.example`. The existing five database variables remain supported; deployment may enable PostgreSQL TLS with `DB_SSL=true`.

## Verification

Auth endpoints can be verified manually against a local PostgreSQL database.

For a local smoke test: recreate the disposable database from `db/schemas/schema.sql`; start PostgreSQL and the API; verify `/health`; register while saving cookies; reuse the cookie for `/users/me`; update the profile; log out and verify access is rejected; log in again; deactivate with the current password; verify subsequent login is rejected.

## Deferred work

Band membership and selected-band context, paid plans, admin APIs, email/password change flows, password recovery, email verification, migrations, Redis, and cloud-specific deployment automation belong to later specifications.
