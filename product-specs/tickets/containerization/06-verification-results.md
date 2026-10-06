# Containerization 06 verification results

Verified 2026-10-06 on Linux amd64 using base revision `368aacb` plus the ticket
06 verification files in this PR. Docker Engine 29.7.2, Compose v5.5.0,
container Node 24.21.0, pinned PostgreSQL 17.11-bookworm.

Application build: `bandos:containerization-06`, local OCI image/index identity
`sha256:7044cdd44b8c6940efbc27dda7774a340a94739fc1fe9a00ef632b1b01c99563`,
platform `linux/amd64`, runtime user `node` (uid 1000). This is a local build,
not a registry-published release digest. The clean build ran in an isolated
worktree with no backend `.env`, host dependencies or frontend dist present.

## Commands and evidence

Commands ran from `/tmp/bandos-container-verification` unless otherwise stated.
Temporary logs contain test results, not env files or cookie/session contents.

| Check | Command | Result |
| --- | --- | --- |
| Clean image | `docker build --platform linux/amd64 --pull --no-cache -t bandos:containerization-06 .` | PASS |
| Tools image | `docker build --pull -t bandos:verification-tools deploy/verify` | PASS |
| Clean frontend installation | `docker run --rm -v /tmp/bandos-container-verification:/work -w /work/frontend node:24.21.0-bookworm-slim sh -c 'npm ci --no-audit --no-fund && npm test && npm run lint && VITE_API_ORIGIN=/ npm run build'` | Installation passed; first test run had one timing failure while image build was running. |
| Frontend checks | `docker run --rm -v /tmp/bandos-container-verification:/work -w /work/frontend node:24.21.0-bookworm-slim sh -c 'npm test && npm run lint && VITE_API_ORIGIN=/ npm run build'` | PASS: 429 tests in 33 files; lint 0 errors, 1 existing warning; build passed. |
| Backend clean install | `docker run --rm -v /tmp/bandos-container-verification:/work -w /work/backend node:24.21.0-bookworm-slim sh -c 'npm ci --no-audit --no-fund && node --test test/runtime-config.test.js test/frontend.integration.test.js'` | Installation passed; initial routing check overlapped the frontend build and had a missing dist fixture. |
| Backend checks, sequential | `docker run --rm -v /tmp/bandos-container-verification:/work -w /work/backend node:24.21.0-bookworm-slim node --test test/runtime-config.test.js test/frontend.integration.test.js` | PASS: 6 tests. |
| Existing lifecycle suite | `bash deploy/verify/lifecycle.sh` runs `node --test test/readiness-shutdown.integration.test.js` with the dedicated disposable `TEST_PG_CONTAINER=bandos-readiness-test` and generated disposable DB_* configuration | PASS: 4 tests, host Node 20.20.2. TCP final-server readiness and a fixed loopback port were necessary for stop/start. Fixture removed. |
| Image history/layers | `docker history --no-trunc bandos:containerization-06`; `docker save bandos:containerization-06 > /tmp/bandos-06-image.tar`; `python3 deploy/verify/image-layers.py /tmp/bandos-06-image.tar` | PASS: all 16 layers, 9242 entries checked; no app env/credential/checkout files. History contains only fixed build inputs and no supplied runtime secrets. |
| Existing Compose checks | `APP_IMAGE=bandos:containerization-06 bash deploy/test/compose-check.sh` | PASS: fresh bootstrap, grants, private ports, replacement, persistence, graceful stop, failed bootstrap gate and recovery. |
| Integrated stack + browser | Command below | PASS: both suites and teardown, security/static matrix, persistence/recovery, Chromium product flows, image scope and graceful stop. |
| Syntax/diff | `bash -n deploy/verify/*.sh deploy/test/compose-check.sh`; `node --check deploy/verify/browser.mjs`; `node --check deploy/verify/edge.cjs`; `git diff --check` | PASS |

```sh
APP_IMAGE=bandos:containerization-06 \
PLAYWRIGHT_MODULE=/home/caelanrt/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
CHROMIUM_PATH=/home/caelanrt/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
BROWSER_CHECK='LD_LIBRARY_PATH=/tmp/bandos-browser-libs/usr/lib/x86_64-linux-gnu node deploy/verify/browser.mjs' \
bash deploy/verify/stack.sh
```

## Topology and result matrix

The real production application image runs behind the test Node HTTPS edge,
with a loopback-only ephemeral public TLS listener. Only the edge's exact
container IP is trusted; runner/client addresses are not trusted proxy peers.
The edge overwrites forwarded protocol/IP/host, never trusts client headers,
and forwards HTTPS traffic to private app:3000. PostgreSQL is private plaintext
on the internal database network. TLS certificate trust is scoped to the
fresh test certificate; Chromium pins its public key. The runtime HTTPS origin
matches the browser's localhost port, with fresh environment-specific secrets.
The app, edge and database are stopped/recreated during the tests; ordinary
restart retains the database volume and session secret.

| Contract | Evidence / result |
| --- | --- |
| Smoke isolation and teardown | PASS: band suite 20/20 and event suite 48/48 through HTTPS, fresh stacks per suite. Prefix-validated SQL teardowns pass with disposable bootstrap credentials; production API role and rate limits unchanged. |
| HTTPS/proxy/rate limits | PASS: untrusted direct socket spoof remains 426; exact private GET health is 200, trailing slash 426. Public forged protocol is overwritten; varying forged client IPs cannot evade registration attempt 6 or login attempt 11 returning 429. Correct CORS origin/credentials also tested with a wrong request origin. |
| Routing/static/security | PASS: deep UI path and unknown UI path return the same HTML; missing JS and POST UI return 404; unknown API returns JSON NOT_FOUND; CSP, nosniff, HTML no-cache and immutable JS verified. |
| Persistence and sessions | PASS: signed cookie still retrieves the same real user, leader membership and Toronto event/date after app replacement, full volume-preserving down/up, and database recovery. Same session secret retained. |
| Database failure and recovery | PASS: paused database yields 503 in less than 5 seconds; static HTML stays available. Unpause returns healthy naturally, with no app/database restart, then persisted API/session requests pass. |
| Browser product flows | PASS: Chromium live registration, login, identity restored by reload, logout, profile update/reload, account deactivation, band/member creation and member access, event creation/detail/schedule. Browser timezone America/Toronto and event date match. Deep-link refresh and unknown UI page work. Secure/HttpOnly/SameSite=Lax cookies, no page errors/CSP violations, every observed API request uses the public HTTPS origin. |
| Image and shutdown | PASS: non-root uid 1000, production scope (no frontend dependencies, nodemon, test scripts or npm), no baked env/credentials in any layer, bcrypt cost 12, production container SIGTERM exits 0 and logs pool closed within 15-second grace. Existing lifecycle tests separately verify active drain and forced timeout. |

## Limitations and follow-up

Reference verification covers Linux amd64 and Chromium, not every supported
browser or an AWS TLS/network/storage topology. No AWS provisioning, release,
backup restoration, rollback or registry publication was performed. Those
remain tickets 07–10. TLS database CA checks from ticket 01 are not rerun against
this intentionally plaintext private Compose database. The existing frontend
warning and the two initial concurrent-check failures above are recorded; no
application/test/rate-limit behavior was altered to make verification pass. During runner development, teardown initially lacked temporary-table privileges (fixed only in the disposable runner), and recovery initially raced Compose health status (fixed by waiting for natural recovery). One interrupted development run resulted from editing the executing shell script; the unchanged finalized runner subsequently passed end to end. All disposable fixtures/projects/volumes were removed; the unrelated dev-postgres container was preserved.

## Independent review

Required review-ticket review: **PASS**, 2026-10-06. Every acceptance criterion
passed; no blocking or non-blocking findings. The independent reviewer checked
the diff, specifications, surrounding code and execution logs, and reran
diff/shell/browser/edge syntax checks.
