# Demonstrate AWS release, digest promotion, and recovery

> **Status:** Planned — not started; deployment inputs pending below

> **Dependencies:** [06 — Container verification](06-container-verification.md) and [07 — AWS prerequisites](07-aws-provisioning.md).

## Objective

Provide and exercise a manual AWS staging release and volume-safe promotion/recovery runbook before CI/CD automation.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 5 (persistence, backup, rollback), 6 candidate 5 and registry delivery contract, 7 criteria 8–9, and 8. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

An image digest is the release artifact; staging begins fresh and production never receives staging data. Container volumes alone do not provide instance-loss recovery.

## Scope

- Document manual image publication/pull, fresh staging bootstrap, environment configuration, health/log troubleshooting, volume-safe updates, and serialized release operations.
- Demonstrate promotion of the accepted digest to a separately configured production target once production inputs are available.
- Define backup ownership/schedule/retention and exercise restore to separate replacement storage plus application-image rollback.

## Out of Scope

- Provisioning resources (07), automated Actions (09–10), general migrations, local database import, and automatic schema rollback.

## Acceptance Criteria

- [ ] The runbook publishes/records immutable image references and pulls by digest, refreshes expiring registry auth, and keeps previous rollback digests available.
- [ ] A documented fresh AWS staging release passes health/static/HTTPS authentication and relevant product checks on the actual edge topology; no local data is imported.
- [ ] The accepted staging application digest runs under the separate production origin/configuration/database without rebuild or staging-data transfer; production demonstration waits for supplied secrets/domains and verified durability/recovery.
- [ ] Normal releases and rollback preserve initialized databases/volumes and stable session secrets. Explicit staging reset cannot target production; schema.sql is never reapplied to retained data.
- [ ] Backup schedule, pre-schema-change backup rule, off-host storage, retention, owner and recovery steps are documented; restoration is executed into isolated replacement storage and validated with users, memberships, events, sessions and timezone checks.
- [ ] A rollback to a previous application digest is demonstrated without destroying/reverting the database schema; retained-data compatibility and acceptable downtime are documented.
- [ ] The runbook covers logs, private/public readiness, persistent unhealthy states, graceful stop, failed bootstrap recovery, and serialized environment release commands. Future schema changes require separately tracked upgrade procedures.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Validate runbook scripts/templates and execute staging rollout, separate-environment same-digest checks, backup restore and application rollback on safe targets; reuse 06 smoke flows with disposable fixtures.

### Manual / Smoke Verification

- Follow the runbook on the chosen AWS topology, confirm secure sessions survive ordinary redeployments, inspect release/digest records and restore/rollback evidence, and record results without secrets.

### Explicitly Not Required

- Production destructive smoke teardown, general schema migration framework, automated schema rollback, or copying staging data to production.

## Implementation Notes

- Inputs: artifacts/results from 04–07; [schema.sql](../../../backend/db/schemas/schema.sql), [smoke suites](../../../backend/test-scripts/), [API contract](../../../backend/backend-specs/00-api-contract.md).
- A staging-only milestone may proceed before production inputs, but do not mark the whole ticket complete until required production/separate-environment and recovery evidence exists. Restore onto isolated storage, never overwrite live production merely to test the runbook.

### Deployment Inputs to Resolve

- Confirm production promotion authority, acceptable downtime, backup frequency/retention and recovery expectations. These are inputs to execution, not blockers to recording this ticket.

These decisions gate deployment execution, not creation of this ticket. Record the chosen values before provisioning or enabling release access; do not substitute guessed values.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [ ] Existing relevant tests pass; no known regression exists in touched behavior.
- [ ] Run syntax/configuration validation for any introduced operational scripts or templates, required smoke/recovery checks above, and `git diff --check`. Do not claim deployment or recovery checks passed without executing them; record commands, environment, and results without secrets.
- [ ] No unnecessary out-of-scope work is introduced.
- [ ] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Tickets 09–10 automate the verified publication and deployment procedure.
