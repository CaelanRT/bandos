# Prepare isolated AWS hosting and registry prerequisites

> **Status:** Planned — not started; deployment inputs pending below

> **Dependencies:** [05](05-compose-database.md) for topology/config contract. May proceed alongside 06 after deployment inputs below are supplied; 08 requires 06–07.

## Objective

Prepare the AWS instance, private PostgreSQL persistence, trusted HTTPS entry point, runtime secret delivery, and registry access required by a manual staging release.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 1, 3–5, 6 candidate 5 (infrastructure inputs), and 8. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

No tracked infrastructure or deployment workflow exists. AWS instance hosting and separate PostgreSQL containers are approved; EC2 details, TLS owner, and ECR identifiers remain deployment inputs.

## Scope

- Record selected deployment inputs and prepare/reproducibly document resources for isolated staging and production configuration/storage.
- Provision or document existing instance/network/TLS/secret/registry resources with least-privilege publisher and instance pull access.
- Provide production storage/backup prerequisites before production use; hand exact topology and access details to 08.

## Out of Scope

- Application/container changes, actual release/restore/rollback demonstration (08), Actions/OIDC provisioning (09–10), and replacing the approved PostgreSQL container baseline with RDS.
- A new IaC framework is not required merely to complete this ticket.

## Acceptance Criteria

- [ ] A deployment input record confirms instance service, region/account, architecture, sizing/resource limits, public origins, operational owner, and trusted TLS proxy/hops; target-architecture image checks from 04 pass if the platform differs.
- [ ] The trusted TLS edge overwrites untrusted forwarding headers; public direct app/database access is blocked. One app replica and private database connectivity are configured.
- [ ] Staging has fresh independently identified PostgreSQL storage and credentials; production configuration/secrets/storage are separate. No local-data transfer is scheduled.
- [ ] Production self-hosted PostgreSQL has durable EBS storage, an explicit termination retention policy, off-host backup destination/permissions, and operational ownership; production remains gated until 08 verifies recovery.
- [ ] Registry identifiers and permissions are documented. If ECR is confirmed, an application repository uses immutable release tags and retention protects deployed/rollback digests; publisher push and instance pull permissions are separate.
- [ ] Runtime secrets use the selected AWS secret facility or restricted host configuration, remain stable across ordinary updates, and do not enter source/image/build arguments. Registry login/pull and a controlled instance-access mechanism are tested.
- [ ] Provisioning output is reviewable and secret-free; actual identifiers/settings and remaining environment gates are recorded without inventing missing values.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Validate any templates/scripts; verify image-pull permissions, secret delivery, private DB connectivity, TLS forwarding and blocked public ports; check production storage retention configuration.

### Manual / Smoke Verification

- Inspect the selected AWS resources and least-privilege boundaries; demonstrate authorized host access and denied inappropriate network/registry access.

### Explicitly Not Required

- Managed database adoption, Kubernetes, autoscaling, multi-replica deployment, or Actions automation.

## Implementation Notes

- Reference artifacts: Compose/configuration from 05 and security contract from 01; [current DB client](../../../backend/db/index.js). There are currently no tracked AWS infrastructure files.
- The plan mentions RDS as an option; the user-approved architecture uses a separate PostgreSQL container. RDS would require explicit architecture approval, rather than being silently selected here. Never inspect or copy local credential values into tickets.

### Deployment Inputs to Resolve

- Confirm EC2/service, account/region, x86_64 versus Arm64, sizing, network access, and operations owner.
- Supply staging/production domains, TLS termination mechanism/owner and actual trusted hop/network topology.
- Select PostgreSQL major version, EBS layout/termination behavior and any TLS/CA needs; confirm backup destination, retention/recovery expectations and owner.
- Confirm ECR or registry choice, repository name, retention/publication permissions, runtime secret facility and host-access mechanism. SSM is proposed, not selected.

These decisions gate deployment execution, not creation of this ticket. Record the chosen values before provisioning or enabling release access; do not substitute guessed values.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [ ] Existing relevant tests pass; no known regression exists in touched behavior.
- [ ] Run syntax/configuration validation for any introduced operational scripts or templates, required smoke/recovery checks above, and `git diff --check`. Do not claim deployment or recovery checks passed without executing them; record commands, environment, and results without secrets.
- [ ] No unnecessary out-of-scope work is introduced.
- [ ] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Ticket 08 performs deployment and recovery; 09–10 add scoped OIDC/automation access.
