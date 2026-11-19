# BE-V2-02 — Enforce bounded sessions, verification access and browser Origin

> **Status:** In progress
> **Dependencies:** [01](01-relational-storage.md)
> **Specification:** [Backend implementation specification](../01-backend-spec.md), sections 4, 6–7
> **Contract:** [Shared contract](../00-shared-contract.md), sections 2–3, 9

## Outcome

Protected requests use current account state and server-enforced session deadlines, with restricted access for unverified accounts.

## In scope

- Extend `app.js`, PostgreSQL session handling and authentication middleware with generation, registration origin, authenticatedAt, lastActivityAt and full/restricted access.
- Regenerate login session IDs; return the shared `{data:{user,session}}` shape for login/current-user reads and the specified snake_case user additions. Preserve idempotent session-optional logout.
- Enforce configured-origin mutation checks including auth, exact client-origin credentialed CORS, production HTTPS and existing HttpOnly/SameSite/Secure cookie rules.
- Add a reusable account lock/generation/deadline recheck for mutation commits. Capture qualifying activity only for successful accepted mutations or explicit successful GETs marked `X-bandos-activity: user`.
- Restrict unverified sessions to identification, verification/resend, recovery and logout; use current account state rather than cached global roles.

## Acceptance criteria

1. Idle expiry at last qualifying activity +24h and absolute expiry at authentication +7d are checked before renewal; exact deadline is expired. Continued active use never extends the absolute deadline.
2. Background/bootstrap/focus/reconnect reads, failures and passive page presence do not renew activity. Cookie/store touch cannot extend application deadlines.
3. Inactive, revoked or expired sessions cannot read protected data or commit writes. A generation change racing a write prevents a stale-session commit.
4. Known expiry/revocation can return the approved reason; a missing stored session returns generic `AUTHENTICATION_REQUIRED`. Credential errors remain distinguishable.
5. Unexpected browser mutation Origin returns `403 ORIGIN_NOT_ALLOWED`; activity headers never bypass authentication or Origin checks.
6. Login distinguishes verified full access from unverified restricted access without exposing credentials. Registration promotion itself is delivered in ticket 05.

## Verification

Use a deterministic clock to test independent deadlines, boundary renewal, passive/explicit reads, revoked-session commit races, login fixation protection and the verification gate. Run existing runtime-security and frontend-serving integration checks affected by session/CORS handling. Covers backend portions of V2-11 and V2-12.

## Boundaries

Follow the [sequence-wide implementation rules](00-ticket-sequence.md#implementation-rules). Implement only this slice and its necessary tests; later tickets own their listed endpoints and transitions. Do not claim downstream behavior is complete before its ticket lands.
