# Deploy staging and promote its accepted digest to production

> **Status:** Planned — not started; deployment inputs pending below

> **Dependencies:** [08 — Release/recovery runbook](08-release-recovery-runbook.md) and [09 — Publication](09-actions-publication.md).

## Objective

Automate staging rollout and explicit production promotion of the same verified application digest using isolated environment configuration and scoped access.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 6 candidate 6 (deployment/promotion), GitHub Actions and registry delivery contract, 7 criteria 9–10, and 8. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

Registry pull permissions do not grant instance deployment access. The deployment mechanism, production release authority, and available GitHub environment protections need confirmation.

## Scope

- Implement controlled instance deployment using the selected mechanism and verified runbook.
- Separate staging and production permissions/secrets/database targets; serialize release jobs per environment.
- Gate production on staging acceptance, select its recorded digest, verify rollout health, and document automated/manual rollback.

## Out of Scope

- Application rebuilds during promotion, AWS host provisioning, image publication (09), database teardown/reset or implicit schema changes/rollback.

## Acceptance Criteria

- [ ] Only a verified digest from 09 can deploy staging; the workflow records revision/digest/environment and validates rollout readiness and HTTPS/static/auth behavior.
- [ ] Production promotion explicitly selects the accepted staging digest without rebuilding or resolving current branch head; production uses its own origin, secrets, and database.
- [ ] GitHub environment protections gate production where visibility/plan supports them; otherwise a documented restricted manual promotion process enforces explicit release authority.
- [ ] Temporary OIDC credentials and selected host-access permissions are constrained to intended repository/environment; untrusted PR code cannot deploy and staging permissions cannot operate production.
- [ ] Deployment jobs and release commands are serialized per environment so overlapping rollouts cannot race.
- [ ] Rollout and rollback preserve database contents, volume identities, and stable session secrets; no teardown or automatic schema rollback is part of release.
- [ ] Failed rollout health is reported with actionable secret-free diagnostics; documented rollback restores the previous retained application digest and verifies health.
- [ ] The deployed production digest is demonstrably equal to the accepted staging digest; workflow/runbook explains approval, failure handling, and environment ownership.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Validate workflow syntax; exercise staging success/failure, serialized runs, accepted-digest promotion, isolated permissions/configuration, and application rollback on controlled targets. Confirm production promotion uses the exact digest even if branch head advances.

### Manual / Smoke Verification

- Verify actual deployment connection and environment protection/manual gate, review release records and scoped IAM access, and compare staging/production digests and database identities without exposing secrets.

### Explicitly Not Required

- New database migration automation, staging data transfer, load testing, or production teardown.

## Implementation Notes

- Inputs: workflows from 09 and AWS/runbook artifacts from 07–08; no existing workflow or deployment connector is established.
- SSM is only proposed. Select/test the actual instance connection separately from ECR login; verify available environment protections rather than assuming required reviewers are supported.

### Deployment Inputs to Resolve

- Confirm deployment mechanism/instance access, environment approval availability, production releasers and promotion policy before enabling deployment jobs.

These decisions gate deployment execution, not creation of this ticket. Record the chosen values before provisioning or enabling release access; do not substitute guessed values.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [ ] Existing relevant tests pass; no known regression exists in touched behavior.
- [ ] Run syntax/configuration validation for any introduced operational scripts or templates, required smoke/recovery checks above, and `git diff --check`. Do not claim deployment or recovery checks passed without executing them; record commands, environment, and results without secrets.
- [ ] No unnecessary out-of-scope work is introduced.
- [ ] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

None.
