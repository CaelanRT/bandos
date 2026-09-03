# Phase 1 Ticket Sequence

> **Status:** Ready for implementation

These tickets implement [`../../02-phase-1-authentication.md`](../../02-phase-1-authentication.md) in dependency order.

1. [`01-restore-sessions-and-enforce-access.md`](01-restore-sessions-and-enforce-access.md) — Restore cookie sessions and enforce route access without auth-state flashes.
2. [`02-log-in-existing-user.md`](02-log-in-existing-user.md) — Allow an existing user to log in and resume a protected destination.
3. [`03-register-new-user.md`](03-register-new-user.md) — Allow a new user to register and enter the authenticated application.
4. [`04-log-out-and-handle-expiration.md`](04-log-out-and-handle-expiration.md) — End sessions safely and recover deterministically when they expire.

Each ticket includes its own tests and relevant documentation. Complete and verify a ticket before starting a dependent ticket.
