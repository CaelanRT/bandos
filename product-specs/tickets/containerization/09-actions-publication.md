# Verify and publish immutable application releases with GitHub Actions

> **Status:** Planned — not started; deployment inputs pending below

> **Dependencies:** [06 — Container verification](06-container-verification.md), [07 — Registry/permissions](07-aws-provisioning.md), and [08 — Verified release contract](08-release-recovery-runbook.md).

## Objective

Automate verification and publication of one application image per trusted release revision, recording its digest for later deployment and promotion.

## Source Specification

[Approved containerization plan](../../01-containerization-plan.md), sections 6 candidate 6 (publication), GitHub Actions and registry delivery contract, and 7 criterion 10. The user-approved architecture governs; unresolved deployment values are not settled decisions.

## Context

The repository has no tracked Actions workflows. A source revision/tag alone is insufficient for immutable deployment; publication must supply a digest built for the actual instance architecture.

## Scope

- Add trusted release verification/build/publication workflow using the established disposable checks.
- Use scoped GitHub AWS OIDC with temporary credentials and separate publisher permissions.
- Publish immutable release references and persist the source revision/image digest association for deployment.

## Out of Scope

- Staging/production deployment, deployment connection/roles, promotion gates (10), AWS host provisioning, and application code changes.

## Acceptance Criteria

- [ ] For a trusted release revision, Actions uses clean lockfile installs, passes frontend/focused backend/container checks including both isolated smoke suites, builds for the selected architecture, and publishes the verified image once.
- [ ] The publication records a commit-SHA/release reference and immutable application digest usable by 10; deployment does not rely on latest or branch head.
- [ ] Failed verification does not publish a release. Untrusted PR code never receives publisher/deployment credentials or performs publication/deployment.
- [ ] AWS access uses temporary OIDC credentials constrained to the actual repository and selected trusted branch/environment subject; publisher permissions are scoped to the chosen registry/repository.
- [ ] No runtime secrets enter build args, frontend variables, image layers, workflow outputs, or artifacts; deployed/rollback digests remain protected by registry retention.
- [ ] Workflow triggers, required permissions, artifact/digest lookup, and authorized manual publication/recovery are documented.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Validate workflow syntax; run a trusted disposable/release workflow through verification and publication, retrieve its digest, and pull/inspect that digest. Check verification failure blocks publication and an untrusted PR cannot obtain publisher credentials.

### Manual / Smoke Verification

- Inspect IAM OIDC subject/trust and repository permissions; reconcile workflow revision, published reference, and digest with the registry record.

### Explicitly Not Required

- Deployment automation or rebuilding a second production image.

## Implementation Notes

- New files belong under .github/workflows/; reuse package scripts in [frontend/package.json](../../../frontend/package.json), image from 04 and runner from 06.
- Use actual OIDC subject formats and registry identifiers confirmed in 07. ECR remains proposed until that decision is recorded; do not encode guessed accounts/regions. Workflow configuration must respect actual repository visibility/plan.

### Deployment Inputs to Resolve

- Supply trusted release trigger/branch/environment, OIDC trust identifiers and publisher role/repository settings using 07’s selected registry.

These decisions gate deployment execution, not creation of this ticket. Record the chosen values before provisioning or enabling release access; do not substitute guessed values.

## Definition of Done

- [ ] All acceptance criteria are satisfied.
- [ ] Required tests and manual checks from the Testing Strategy pass and their results are recorded.
- [ ] Existing relevant tests pass; no known regression exists in touched behavior.
- [ ] Run syntax/configuration validation for any introduced operational scripts or templates, required smoke/recovery checks above, and `git diff --check`. Do not claim deployment or recovery checks passed without executing them; record commands, environment, and results without secrets.
- [ ] No unnecessary out-of-scope work is introduced.
- [ ] Follow AGENTS.md: isolated feature work, required independent review-ticket review, pushed commit, Draft PR, and ticket status For Review.

## Follow-up Work

Ticket 10 consumes the published verified digest.
