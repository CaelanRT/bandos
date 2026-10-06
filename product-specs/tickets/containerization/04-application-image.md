# Build one non-root application image from clean lockfiles

> **Status:** Completed — [merged PR #66](https://github.com/CaelanRT/bandos/pull/66)

> **Dependencies:** [01](01-runtime-configuration-security.md), [02](02-readiness-shutdown.md), and [03](03-express-frontend.md).

## Objective

Produce a reproducible combined backend/frontend deployment artifact with production dependencies and no host secrets or build tools.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 3 (application image and image/configuration decisions), 4, 6 candidate 3, and 7 criteria 1, 5, 7. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

There is no Dockerfile or root Docker ignore file. Both applications have lockfiles; backend bcrypt has native platform requirements and frontend Vite is a development dependency.

## Scope

- Add a repository-root-context multi-stage Dockerfile and .dockerignore covering both trees.
- Use reviewed pinned Node 24 Debian slim versions/digests; compile frontend with / and install backend production dependencies inside the selected platform image.
- Copy only backend runtime files, production dependencies, and generated frontend assets; run Node directly as non-root. Document image build/update/platform commands.

## Out of Scope

- Compose orchestration, registry publication, AWS provisioning, CI/CD, dependency upgrades solely for containerization, and database contents in the image.

## Acceptance Criteria

- [x] A clean checkout builds without local node_modules, dist, or private .env files using npm ci and existing lockfiles; manifests precede source copies for dependency caching.
- [x] The build context excludes .env* except deliberate secret-free examples, both node_modules/dist trees, Git metadata, logs, local credentials, and smoke-test artifacts.
- [x] The runtime has one non-root Node process on private port 3000 using exec-form startup; frontend files are readable by that user.
- [x] The final image contains backend production dependencies and frontend assets, without Vite, nodemon, test tools, the database server, local credentials, or baked runtime secrets.
- [x] Static frontend/API delivery, bcrypt hashing and login, private readiness, and SIGTERM succeed on the selected CPU architecture.
- [x] The same image accepts environment-specific backend configuration without rebuilding its frontend; base images are pinned and the update procedure is recorded.

## Testing Strategy

### Unit Tests

- None required; reuse tickets 01–03 checks.

### Integration Tests

- Clean image build; inspect runtime user/dependency scope and image contents/history for prohibited files or secrets. Run packaged static/API, bcrypt register/login, readiness, and shutdown checks with disposable PostgreSQL.

### Manual / Smoke Verification

- Repeat the documented build from a fresh checkout without host artifacts; confirm runtime permissions and record tested platform/image identity.

### Explicitly Not Required

- Multi-platform publication unless actual deployment targets require it; backend host node_modules copying or dependency-version modernization.

## Implementation Notes

- Inputs: [backend package/lockfile](../../../backend/package.json), [frontend package/lockfile](../../../frontend/package.json), [app.js](../../../backend/app.js), [vite.config.js](../../../frontend/vite.config.js).
- Do not pass secrets through build arguments or VITE_* values. Select a reference architecture for local verification; ticket 07 confirms the AWS architecture and requires revalidation if it differs. Pin exact reviewed base references during implementation rather than freezing a guessed digest in this ticket.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [x] Existing relevant tests pass; no known regression exists in touched behavior.
- [x] Run frontend `npm test`, `npm run lint`, and `npm run build`; run relevant focused backend checks, Docker/Compose checks described above, `bash -n` on changed shell scripts, and `git diff --check`. Use clean lockfile installs and disposable databases.
- [x] No unnecessary out-of-scope work is introduced.
- [x] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Ticket 05 consumes this artifact; ticket 09 publishes it.

## Implementation and Verification Record — 2026-10-06

Implementation: repository-root [Dockerfile](../../../Dockerfile),
[.dockerignore](../../../.dockerignore), and [image guide](../../../container-image.md).
Only this ticket's tracking record was added; other untracked planning files
in the original checkout were preserved.

- Pinned official Node 24.21.0 Debian bookworm slim index
  `sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`.
  Tested platform: `linux/amd64`; Node reports `v24.21.0`.
- Application image tested in both environment configurations:
  `sha256:2c49302dddb650bc3a5290ef62bd8fc3f79c34a84102fa69a5a2490f97e35d2e`
  (local image identity, not a published registry release).
- `docker build --platform linux/amd64 --pull --no-cache`: PASS from the
  isolated checkout without host artifacts; repeated from a fresh Git archive
  plus the new Dockerfile/ignore file, also without dependencies/build/env files.
- Actual context exported through a disposable `FROM scratch; COPY .` build:
  PASS, 88 allowlisted build-input files. Harmless sentinels at root/nested `.env`, `.npmrc`, `.aws`, `.ssh`,
  Git metadata, node_modules, dist, logs, cookies, and smoke artifact paths
  were excluded, as were repository tests. No private host secrets were used.
- Image configuration, filesystem, saved application layers, and
  `docker history --no-trunc`: PASS. Only backend runtime files/production
  dependencies and generated frontend assets were copied. No runtime test
  secrets, host credentials, frontend dependencies, nodemon/Vite/Vitest/Oxlint,
  npm/Yarn/headers, compiler, PostgreSQL client/server, schema, or test runners.
- `docker top`: one `node app.js` process, uid 1000. Entrypoint `["node"]`,
  command `["app.js"]`, internal port 3000 with no published host bindings.
  Static files/fonts readable as that user.
- Clean `npm ci` on the pinned Node image, frontend `npm test`: PASS,
  33 files / 429 tests. `npm run lint`: PASS, 0 errors; the existing
  `react(set-state-in-effect)` warning at `EditEvent.jsx:41` remains.
  `VITE_API_ORIGIN=/ npm run build`: PASS.
- Clean backend `npm ci`,
  `node --test test/runtime-config.test.js test/frontend.integration.test.js`:
  PASS, 6 tests.
- Packaged production checks with disposable PostgreSQL 18 and a restricted
  non-superuser application role: PASS. Exact private HTTP readiness 200,
  plain HTTP protected routes 426, deep-link/index/static script/style/font
  delivery with intended caching, missing assets/source/unknown API JSON 404,
  registration, bcrypt default cost 12 and hash comparison, identity, logout,
  login, Secure/HttpOnly/SameSite=Lax cookies, and runtime-origin CORS.
  Forwarded HTTPS was supplied only over the explicitly trusted loopback peer
  inside the test container; no public port or deployed TLS edge was used.
- That exact image ran with `https://staging.example.test` / database `image04`
  and `https://production.example.test` / database `image04_second`, with separate
  session secrets. Both passed auth/static checks; all generated asset SHA-256
  hashes matched, including JS
  `08b50bdc3aebc61a5324c6d589c09bbc0a75b602909517dbb7a3b7e8ae617509`.
- `docker stop --timeout 15` on both packaged processes: PASS, exit 0 in under
  one second, with `Shutdown complete; database pool closed`. The image guide
  records grace-period adjustment and the base-pin/platform update procedure.
- `git diff --check`: PASS. No shell scripts changed, so `bash -n` is not
  applicable. Compose and the full browser/product/persistence matrix remain
  assigned to tickets 05–06.

### Independent Review

Required `review-ticket` review: **PASS** on 2026-10-06. The independent
reviewer passed all six acceptance criteria, reviewed the diff/specification/
surrounding code and verification evidence, and inspected the Docker image
configuration and both stopped containers. No blocking or non-blocking findings;
no outstanding ticket-specific manual verification.
