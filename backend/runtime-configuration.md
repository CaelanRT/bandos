# Backend runtime configuration

Start with `.env.example`, supply its blank required values in an ignored `.env`
for local development, then run `npm start` from `backend/`. In deployment,
inject the values into the process at runtime. Validation runs before the pool,
routes, or listening socket are created; diagnostics name invalid settings
without printing their values. Missing values and explicitly empty optional
settings are errors unless a default is listed below.

| Setting | Contract |
| --- | --- |
| `NODE_ENV` | `development` (default), `test`, or `production`. |
| `PORT` | Integer 1–65535; omitted defaults to 3000. |
| `CLIENT_ORIGIN` | Required single HTTP(S) origin, e.g. `http://localhost:5173`; no trailing slash, path, credentials, query, or fragment. Production requires HTTPS. CORS allows this origin and credentials. |
| `SESSION_SECRET` | Required nonempty secret. Generate a strong random value (at least 32 random bytes); keep it stable across redeployments to preserve sessions. Rotation may invalidate sessions. Never commit it. |
| `DB_HOST` | Required application database host. In Compose use the database service name, not localhost. |
| `DB_PORT` | Integer 1–65535; omitted defaults to 5432. |
| `DB_NAME` | Required application database name. |
| `DB_USERNAME` | Required application database role; use a restricted role in deployment. |
| `DB_PASSWORD` | Required application role password, injected privately. |
| `DB_SSL` | Exactly `true` or `false`; omitted defaults to `false`. Use explicit `false` only on the approved private Compose network or local development connection. Use `true` for external database TLS. |
| `DB_SSL_CA_FILE` | Optional readable PEM CA bundle path, allowed only with `DB_SSL=true`. Mount it read-only. If omitted, Node's default trusted CA store is used. An explicit bundle replaces that store for this connection. |
| `BCRYPT_ROUNDS` | Integer 4–31 (bcrypt's supported range); omitted defaults to 12. Retain 12 for deployment; large costs can take prohibitive time. Lower costs are suitable only for disposable tests. |
| `TRUST_PROXY` | Omitted or `false` trusts no forwarded headers. Otherwise comma-separated literal IPv4/IPv6 addresses or CIDRs, e.g. `192.0.2.10,2001:db8::10/128`. Empty entries, named ranges, boolean `true`, hop counts and `/0` are rejected. |

TLS always uses `rejectUnauthorized: true` and checks the certificate identity
against `DB_HOST`, including IP SANs for IP hosts. Unknown CAs and hostname
mismatches fail the connection; there is no insecure fallback. Keep the CA file
readable by the application user. Do not disable TLS verification globally.

Choose proxy addresses for the actual edge topology in ticket 07. Trust only
controlled proxies, restrict network access to the backend, and configure the
edge to overwrite `X-Forwarded-Proto` and `X-Forwarded-For`. Broad CIDRs can trust
unintended callers. Both protocol and client IP use the same Express policy in
all environments. Production rejects plain HTTP with 426, including health
until ticket 02 adds its narrow private probe allowance. No global HTTPS spoof
is used. The session cookie remains `bandos.sid`, Secure in production,
HttpOnly, SameSite=Lax, with rolling seven-day expiry.

These five `DB_*` connection variables retain their existing names. They
configure the application connection, not PostgreSQL initialization. Later
Compose bootstrap settings (`POSTGRES_*` or provisioning credentials) belong
to database creation and must not replace the restricted application role.
Do not ship bootstrap/admin credentials in the API image.

Frontend `VITE_API_ORIGIN` is public build-time configuration, separate from all
backend runtime values. Never place session or database secrets in `VITE_*`
variables or image build arguments. Ticket 03 documents the same-origin `/`
frontend build choice.

## Verification

Focused configuration checks: `node --test test/runtime-config.test.js`.
Database/security integration checks:
`node --test test/runtime-security.integration.test.js`, using a disposable,
schema-initialized PostgreSQL database with TLS enabled. Supply private `DB_*`
values, `DB_SSL_CA_FILE` for its trusted test CA and
`TEST_UNTRUSTED_CA_FILE` for a different valid CA. The integration test creates
users/sessions; never point it at retained application data. It also runs an
isolated HTTP process to verify production auth, cookies, CORS and forwarded
headers. Run the existing band/event smoke suites against separate development
API processes so their per-process registration limits do not interfere.

See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and
[node-postgres TLS configuration](https://node-postgres.com/features/ssl).
