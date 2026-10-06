# Containerization Ticket Sequence

> **Status:** Tickets 01–06 completed (PR #68 merged); later deployment inputs remain pending
> **Specification:** [Approved containerization plan](../../01-containerization-plan.md)
> **Tracking:** Repository Markdown tickets and this sequence are the tracking records, following the existing frontend ticket convention. No application implementation is included.

The approved baseline is one application image with Express serving built frontend files and `/api/v1`, a separate persistent PostgreSQL container, and Docker Compose for networking, initialization, readiness, and startup. AWS instance hosting and eventual GitHub Actions releases follow. ECR and Systems Manager remain proposals until the deployment inputs are confirmed. Build once and promote the accepted application digest, with separate staging/production origins, secrets, configuration and databases. Staging starts fresh; no local-data migration is required.

## Implementation Order and Dependencies

Use the numbered order as the default; the explicit prerequisites below permit independent work where safe.

| Ticket | Workstream | Dependencies |
| --- | --- | --- |
| [01 — Validate backend runtime configuration and deployment security](01-runtime-configuration-security.md) | Containerization | None. Owns the runtime configuration/security contract used by tickets 02–05. |
| [02 — Bound API readiness and gracefully stop the backend](02-readiness-shutdown.md) | Containerization | [01 — Runtime configuration/security](01-runtime-configuration-security.md). |
| [03 — Serve the built frontend and same-origin API through Express](03-express-frontend.md) | Containerization | No implementation dependency; agree middleware boundaries with 01–02. Can proceed alongside runtime work. |
| [04 — Build one non-root application image from clean lockfiles](04-application-image.md) | Containerization | [01](01-runtime-configuration-security.md), [02](02-readiness-shutdown.md), and [03](03-express-frontend.md). |
| [05 — Orchestrate the application and fresh persistent PostgreSQL with Compose](05-compose-database.md) | Containerization | [04 — Application image](04-application-image.md). |
| [06 — Verify containerized product flows, persistence, and failure recovery](06-container-verification.md) | Containerization | [05 — Compose/database](05-compose-database.md); runtime and frontend behaviors from 01–04 complete. |
| 07 — Prepare isolated AWS hosting and registry prerequisites | AWS / manual release | [05](05-compose-database.md) for topology/config contract. May proceed alongside 06 after deployment inputs below are supplied; 08 requires 06–07. |
| 08 — Demonstrate AWS release, digest promotion, and recovery | AWS / manual release | [06 — Container verification](06-container-verification.md) and 07 — AWS prerequisites. |
| 09 — Verify and publish immutable application releases with GitHub Actions | Later CI/CD | [06 — Container verification](06-container-verification.md), 07 — Registry/permissions, and 08 — Verified release contract. |
| 10 — Deploy staging and promote its accepted digest to production | Later CI/CD | 08 — Release/recovery runbook and 09 — Publication. |

Tickets 01 and 03 may proceed independently; coordinate edits to backend/app.js and agree API/session/static middleware boundaries. Ticket 02 follows 01. Ticket 04 waits for 01–03; 05 follows 04; 06 verifies the reference stack. Ticket 07 can proceed alongside 06 after 05 and its deployment inputs are supplied. Ticket 08 requires 06–07. Publication 09 follows the verified manual release contract; deployment/promotion 10 follows 08–09. No AWS or Actions prerequisite blocks tickets 01–06.

## Mapping from the Plan’s Proposed Sequence

| Plan candidate | Created tickets | Reason for split |
| --- | --- | --- |
| 1 — Runtime readiness | 01 configuration/security; 02 readiness/shutdown | Separate startup/security contract from process lifecycle and database failure behavior. |
| 2 — Express frontend | 03 | One coherent routing/static/configuration boundary. |
| 3 — Combined image | 04 | One build artifact. |
| 4 — Compose and verification | 05 orchestration/bootstrap; 06 integrated verification | Review configuration/bootstrap separately from disposable runners and full browser/persistence evidence. |
| 5 — AWS release/recovery | 07 provisioning prerequisites; 08 exercised runbook | Infrastructure choices/access are distinct from deployment/restore/rollback evidence. |
| 6 — Actions | 09 verification/publication; 10 deployment/promotion | Immutable publication is independently useful before granting deployment access. |

Tickets 07–10 remain planning drafts; their ticket files will be tracked when that work is picked up.

## Remaining Deployment Decisions

- **07:** AWS instance service/details, account/region, CPU architecture, sizing, network access and operations owner; domains, TLS owner/edge and proxy topology; PostgreSQL version and EBS retention/layout; secret facility; registry choice/name/retention/permissions and instance access. ECR and SSM are proposed, not assumed.
- **08:** Production release authority, downtime and recovery expectations, backup schedule/retention/ownership and supplied production domains/secrets. A staging-only milestone does not complete production recovery/promotion criteria.
- **09:** Trusted publication triggers/branch/environment and actual scoped OIDC trust/role identifiers.
- **10:** Deployment mechanism, promotion policy/releasers and GitHub environment protection availability; restricted explicit manual promotion is the fallback where protections are unavailable.

The user-approved baseline retains separate PostgreSQL containers. The plan’s RDS alternative requires explicit approval to change that architecture; it is not silently adopted. Reference image/version/configuration syntax choices can be made and documented in tickets 01–05. Actual deployment architecture and security values must be resolved in 07 and revalidated where they differ from reference tests.

## Completion and Verification Boundaries

Each ticket includes goal, inherited scope/constraints, exclusions, source/code references, acceptance criteria, proportionate automated/manual checks and definition of done. Tickets 01–06 deliver a verified reference container stack. Tickets 07–08 prepare and demonstrate manual AWS release/recovery; production operational checks gate production use. Tickets 09–10 add later automation. A deployment-input-dependent ticket must retain its pending status until its inputs and acceptance evidence are complete.

Ticket 06 is [Completed in merged PR #68](https://github.com/CaelanRT/bandos/pull/68). Evidence is recorded in [container verification results](06-verification-results.md).

Implementation follows AGENTS.md, including independent review before a Draft PR and For Review status; creation of these tickets does not mark work implemented or verified. The plan’s completion criteria map to 04 (clean artifact), 05 (bootstrap), 01–03/06/08 (security/product/routing), 02/05–06 (lifecycle/persistence), 08 (restore/rollback/same digest), and 09–10 (eventual Actions). No application tests or container/deployment runs are claimed during ticket creation.
