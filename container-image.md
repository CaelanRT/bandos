# Combined application image

Run these commands from the repository root. Docker builds both applications
from their existing lockfiles; no local `node_modules`, `dist`, or `.env` is
needed. The context allows only named source/build inputs and excludes all
`.env*` files, including examples. Do not pass secrets as build arguments.

```sh
docker build --platform linux/amd64 --pull -t bandos:local .
docker image inspect bandos:local --format '{{.Id}} {{.Os}}/{{.Architecture}} {{.Config.User}}'
```

The reference platform is Linux amd64. Build with `--platform linux/arm64` only
when that is the actual target, then repeat the checks below there. Native
bcrypt installs inside that platform's Node image. Ticket 07 must confirm the
AWS architecture; another architecture is not verified by an amd64 result.

The frontend build uses `VITE_API_ORIGIN=/`, so requests target `/api/v1` on the
browser's origin. Set `CLIENT_ORIGIN`, `SESSION_SECRET`, and the `DB_*` values
at runtime using the [backend contract](backend/runtime-configuration.md).
Changing environments does not require rebuilding the frontend. Keep staging
and production origins, secrets, and databases separate; promote a published
image digest, never staging database contents.

The image runs `node app.js` directly as uid/gid 1000 in `/app/backend`.
Root-owned runtime files are readable by that user. Generated frontend files
live in `/app/frontend/dist`. It contains backend production dependencies but
no frontend dependencies, npm/Yarn, Node headers, nodemon, repository tests,
schema bootstrap files, database server, or host credentials. No application
dependency versions change for this image.

## Runtime boundary

Port 3000 is internal: `EXPOSE` does not publish it. Do not use `-P` or publish
it on a public interface. Connect the application to a private database network
and the controlled TLS edge; configure `TRUST_PROXY` for that edge's actual
addresses. The edge must overwrite forwarded headers. Production requires
HTTPS except the private exact `GET /api/v1/health` readiness probe.

For a schema-initialized disposable database on an existing private network:

```sh
docker run -d --name bandos-image-check --network YOUR_PRIVATE_NETWORK \
  --env-file /absolute/private/path/runtime.env --stop-timeout 15 bandos:local
docker exec bandos-image-check node -e \
  "fetch('http://127.0.0.1:3000/api/v1/health').then(r => { if (r.status !== 200) process.exitCode = 1; }).catch(() => { process.exitCode = 1; })"
docker stop --timeout 15 bandos-image-check
docker inspect bandos-image-check --format '{{.State.ExitCode}}'
docker logs bandos-image-check
docker rm bandos-image-check
```

The private env file is outside the checkout, readable only by its operator,
and contains the required values from the backend contract. Use the database's
private service name for `DB_HOST` and a restricted application role, not its
bootstrap administrator. Supply `NODE_ENV=production` and a real HTTPS
`CLIENT_ORIGIN`. The image defaults to production/port 3000. Ordinary image
replacement does not initialize or modify the schema. Compose bootstrap,
volume management, restart policies, and probes belong to ticket 05.

The 15-second stop timeout accommodates the default 10-second application
shutdown deadline. Increase it to at least the configured deadline plus five
seconds if changing `SHUTDOWN_TIMEOUT_MS`. An exit code of 0 and the
`Shutdown complete; database pool closed` log confirm graceful termination.

## Base updates

The shared `base` stage pins the official
`node:24.21.0-bookworm-slim` multi-platform index digest
`sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`.
It was resolved on 2026-10-06 from Docker Hub; the official source revision is
[`93a7bafc324a85ac1ee461604cff87cffacb6d7a`](https://github.com/nodejs/docker-node/blob/93a7bafc324a85ac1ee461604cff87cffacb6d7a/24/bookworm-slim/Dockerfile).
The amd64 child manifest is
`sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd`.

For an update, review the official Node release and Debian variant, resolve
the exact patch tag with `docker buildx imagetools inspect
node:VERSION-bookworm-slim`, and verify its platforms/source. Update both tag
and digest in the one `FROM` line. A digest stays fixed even with `--pull`;
security updates require a reviewed pin change and a rebuild.
[Docker's guidance](https://docs.docker.com/build/building/best-practices/)
describes this version/digest pinning tradeoff.

## Verification for builds and pin updates

1. Build a fresh checkout with `--pull --no-cache` and no host artifacts.
   Inspect user, entrypoint, command, platform, and `docker history --no-trunc`.
   Inspect the filesystem and production dependency scope; confirm host
   credentials/artifacts are absent and bcrypt can hash/compare as uid 1000.
2. With clean `npm ci` installs on Node 24, run frontend `npm test`,
   `npm run lint`, and `VITE_API_ORIGIN=/ npm run build`; run backend
   `node --test test/runtime-config.test.js test/frontend.integration.test.js`.
3. Run the built production image with a schema-initialized disposable
   PostgreSQL instance. Check private readiness, HTTPS enforcement, generated
   scripts/styles/fonts, deep links, missing assets and unknown API routes,
   registration/login/identity/logout, default bcrypt cost 12, secure cookie
   attributes, and SIGTERM exit 0 within the stop grace period.
4. Run that exact image identity under a second HTTPS origin and separate
   database/secrets; confirm CORS follows runtime configuration and the
   frontend asset bytes remain identical. Do not rebuild between environments.
5. Run `git diff --check`. Record platform/image identity and actual results
   in [ticket 04](product-specs/tickets/containerization/04-application-image.md).

Full product flows, browser checks, persistence, and failure recovery are
ticket 06; registry publication, AWS hosting, and Actions are later tickets.
