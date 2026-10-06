# Disposable container verification

Run from the repository root. Requires Docker/Compose, Bash, OpenSSL, ripgrep
and GNU sed on the host. Never point this runner at a retained environment.

```sh
docker build --platform linux/amd64 --pull --no-cache -t bandos:verification .
docker build --pull -t bandos:verification-tools deploy/verify
APP_IMAGE=bandos:verification bash deploy/verify/stack.sh
APP_IMAGE=bandos:verification bash deploy/test/compose-check.sh
# Requires host Node and Python 3, plus installed backend lockfile dependencies:
bash deploy/verify/lifecycle.sh
docker save bandos:verification > /tmp/bandos-verification-image.tar
python3 deploy/verify/image-layers.py /tmp/bandos-verification-image.tar
rm /tmp/bandos-verification-image.tar
bash -n deploy/verify/*.sh deploy/test/compose-check.sh
git diff --check
```

The runner generates its own random project name, private temporary env file,
three random secrets, certificate and database volume. It accepts an already
built application image (`APP_IMAGE`) and tools image (`VERIFY_IMAGE`, default
`bandos:verification-tools`). It never reads a deployment env file. The only
copied backend inputs are the four smoke scripts; `backend/.env` cannot be
sourced. Each suite gets a fresh database and API instance, with explicit
`BASE_URL=https://edge:3443/api/v1`. Teardown retains existing prefix validation.
Only the test runner receives disposable bootstrap credentials because the
existing teardowns create temporary tables. The API still receives the
restricted `bandos_app` role. PostgreSQL has no host port. The tools image is
separate from the production Dockerfile and build context.

The HTTPS edge publishes only an ephemeral **127.0.0.1** port. A one-day
self-signed test certificate covers localhost/edge; curl and Node trust only
that generated certificate in addition to their normal CA stores. The edge
removes all incoming Forwarded/X-Forwarded-* headers and supplies protocol,
client IP and host from the connection. `TRUST_PROXY` is its exact dynamically
inspected IP, never the whole bridge subnet. The public health exception is
served over HTTPS here; direct HTTP checks occur only on the private network.
This is a verification edge, not a deployment proxy recommendation.

After isolated suites, the runner checks exact CORS headers, public and direct
header spoofing, unchanged 5/hour registration and 10/15-minute login limits,
static/deep-link/API boundaries, CSP/content/cache headers, real signed-session
and user/membership/event persistence after app replacement and volume-safe
stack down/up, a paused-database bounded 503, static availability, recovery,
non-root runtime scope, bcrypt and graceful stop. All newly created volumes
are deleted on exit, including failure. No retained project is selected.

## Browser verification

Use an existing host Playwright/Chromium installation; no application dependency
or browser framework is introduced. The optional script pins only the generated
certificate's public key in Chromium (it does not disable all TLS checks).

```sh
APP_IMAGE=bandos:verification \
  BROWSER_CHECK='node deploy/verify/browser.mjs' \
  bash deploy/verify/stack.sh
```

If Playwright is outside Node's normal resolution, supply `PLAYWRIGHT_MODULE`
(an absolute module path). `CHROMIUM_PATH` optionally selects a local executable.
Install browser system libraries through your normal host setup. The runner
passes `VERIFY_ORIGIN` and `VERIFY_CA` to the browser command, after recovery and
before shutdown. Browser failure fails the workflow and still cleans up.
The script uses live product forms and Chromium requests, checks same-origin
URLs/cookies/CSP, registrations, login/logout/restoration, profile changes and
deactivation, memberships and event creation/detail/schedule/date/timezone.
A base run without `BROWSER_CHECK` does **not** claim browser completion.

## Clean repository checks

Use Node 24 and lockfile installs. Run frontend first, then backend routing
checks: the latter temporarily replace/restore frontend dist fixtures.

```sh
(cd frontend && npm ci --no-audit --no-fund && npm test && npm run lint && VITE_API_ORIGIN=/ npm run build)
(cd backend && npm ci --no-audit --no-fund && node --test test/runtime-config.test.js test/frontend.integration.test.js)
```

`lifecycle.sh` reuses `backend/test/readiness-shutdown.integration.test.js` with its dedicated
`TEST_PG_CONTAINER=bandos-readiness-test` disposable PostgreSQL fixture and
generated explicit DB_* values to verify active-request drain and forced timeout. Never
reuse an existing container with that name or supply production credentials.
TLS database CA checks from ticket 01 apply to external TLS databases; this
reference Compose stack deliberately uses private plaintext PostgreSQL.

Record exact commands, revision, environment, image identity/platform and
pass/fail results in the [ticket 06 results](../../product-specs/tickets/containerization/06-verification-results.md).
Actual AWS networking, TLS edge and storage require revalidation in ticket 08.
