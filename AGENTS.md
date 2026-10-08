# bandOS Agent Instructions

This file defines the repository-wide working conventions for bandOS.

Follow these instructions for all work in this repository unless a more specific `AGENTS.md` exists deeper in the directory tree or the user explicitly gives different instructions.

## Project Structure

bandOS is divided into a frontend and backend.

* `frontend/` contains the frontend application.
* `backend/` contains the backend application.
* `frontend/frontend-spec/` contains specifications and implementation context relevant to frontend work.
* `backend/backend-spec/` contains specifications and implementation context relevant to backend work.

Before implementing a ticket, inspect the relevant specification documents and existing code necessary to understand the requested behaviour.

Do not read unrelated specification documents unless they are needed for the task.

---

# General Engineering Principles

## Prefer the smallest correct change

Implement only what is necessary to satisfy the ticket.

Avoid:

* unrelated refactors
* speculative abstractions
* unnecessary dependency changes
* restructuring working code without a concrete reason
* expanding the scope of the ticket without being asked

If existing code already establishes a reasonable pattern, prefer following it over introducing a new one.

## Keep code simple

Prefer the simplest implementation that is correct, readable, and maintainable.

Optimize for:

1. correctness
2. readability
3. simplicity
4. consistency with the existing codebase

Avoid clever code when straightforward code communicates the intent more clearly.

Prefer explicit behaviour over unnecessary abstraction.

## Keep changes readable

Code should make its purpose reasonably obvious to another developer reading it later.

Use clear names and straightforward control flow.

Keep functions and modules focused, but do not split code into additional layers solely for the sake of abstraction.

## Testing

Add or update tests when they provide meaningful confidence in the behaviour being changed.

Tests should focus on important behaviour, edge cases, regressions, and ticket acceptance criteria.

Do not create excessive tests for trivial implementation details.

Prefer a small number of useful tests over a large number of repetitive or overly granular tests.

Do not weaken, remove, or bypass existing tests simply to make a change pass.

Run the relevant test suite before considering implementation complete.

---

# Ticket Implementation Workflow

When asked to pick up or implement a ticket, treat the following workflow as the default unless explicitly instructed otherwise.

## 1. Understand the ticket

Before modifying code:

* Read the ticket and its acceptance criteria.
* Inspect the relevant existing implementation.
* Read the relevant frontend or backend specification documents.
* Identify the smallest reasonable implementation.
* Check for existing patterns that should be followed.

Do not begin by redesigning the surrounding system.

## 2. Prepare the Git work

Work on an appropriate feature branch or worktree rather than directly on `main`.

Before making changes, make sure the work is based on the current remote `main` unless doing so would interfere with existing uncommitted or in-progress work.

Keep ticket-specific work isolated from unrelated changes.

## 3. Implement the ticket

Implement the requested behaviour while following the engineering principles in this file.

Keep the diff focused on the ticket.

If something outside the requested scope appears broken or worth improving, do not automatically include it in the implementation unless it is necessary for the ticket.

## 4. Verify the work

Before creating the PR:

* Review the diff.
* Run relevant tests.
* Run any relevant linting, build, type-checking, or smoke checks already used by the project.
* Confirm the implementation satisfies the ticket acceptance criteria.
* Remove debugging code and temporary files.

Do not claim that a check passed unless it was actually run successfully.

## 5. Independent Review

After the implementation has been completed and all relevant tests, linting, build checks, type checks, and smoke checks have passed, use the `review-ticket` skill located at `~/.codex/skills/review-ticket.md` before creating the Draft Pull Request.

The `review-ticket` skill MUST be used for normal ticket implementations. Follow the skill's instructions and spawn an independent subagent to review the completed work. The reviewing subagent should evaluate the implementation against the ticket and its acceptance criteria, relevant specification documents, the diff against the base branch, and the surrounding code necessary to understand the change.

The independent review should specifically evaluate:

* whether every acceptance criterion has been satisfied
* whether the implementation is correct
* whether the change stays within the scope of the ticket
* whether the code is unnecessarily long, complex, abstract, or convoluted
* whether a simpler and more readable implementation would achieve the same result
* whether the tests provide appropriate confidence without being excessive

The implementation agent should not perform this review itself in place of the subagent.

If the review returns blocking findings or a failing verdict, address those findings before proceeding. After making review-driven changes, rerun the relevant automated checks. Repeat the independent review when the changes materially affect the implementation or address a blocking review finding.

Do not create the Draft Pull Request or move the ticket to **For Review** until the independent review has passed.


## 6. Create the GitHub pull request

Once the implementation is in a reviewable state:

* Commit the completed ticket work.
* Push the feature branch to the remote.
* Create a **Draft Pull Request** on GitHub.
* Give the PR a clear title describing the implemented ticket.
* Include a concise summary of what changed.
* Include relevant testing or verification performed.
* Link or reference the ticket when possible.

The PR should remain a **draft** unless explicitly instructed to mark it ready for review.

## 7. Update the ticket

After the Draft Pull Request has been created successfully:

* Associate the PR with the ticket when the tooling supports it.
* Update the ticket's shared project status to **For Review** or the equivalent review state used by the project.

Do not mark the ticket completed at this stage.

The implementation phase is finished when:

* the requested code has been implemented,
* relevant verification has passed,
* changes have been pushed,
* a Draft PR exists, and
* the ticket is marked for review.

At that point, report the PR and verification results to the user.

---

# Review and Completion Workflow

The implementation is not considered fully closed simply because a Draft PR exists.

When the user explicitly indicates that the reviewed work is complete, accepted, merged, or says something equivalent to:

> the work is done

perform the following completion workflow.

## 1. Confirm the merged state

Verify that the relevant PR has been merged into the remote `main` branch before destructive Git cleanup.

Do not delete a branch or worktree containing unmerged or unique work.

If the PR has not been merged, do not pretend that cleanup can safely be completed.

## 2. Update the ticket

After confirming the implementation is merged:

* Mark the implemented ticket as **Completed**, **Done**, or the equivalent completed state used by the project.
* Ensure any relevant ticket-to-PR relationship remains intact.

### Persist completion metadata

If completing the ticket modifies repository-tracked ticket, status, or other workflow metadata, persist those completion changes to GitHub as part of the completion workflow.

After confirming that the implementation PR has already been merged:

* verify that the pending changes contain only ticket/status/workflow metadata related to the completed ticket
* commit those changes directly to the local `main` branch
* use a concise commit message describing the ticket completion or cleanup
* push the commit to `origin/main` without asking the user for an additional confirmation

This is a narrow exception to the normal rule against making ticket implementation changes directly on `main`.

Do not use this exception for:

* application code
* tests
* configuration
* specifications unrelated to ticket status
* refactors
* fixes discovered during cleanup
* any change that should have gone through the reviewed Pull Request

If the working tree contains changes beyond completion metadata, do not push them to `main`. Preserve them and report the unexpected state instead.

## 3. Clean up Git work

Remove ticket-specific local Git resources that are no longer needed.

This normally includes:

* deleting the completed feature worktree, if one was created
* deleting the completed local feature branch
* pruning stale worktree references when appropriate
* removing the remote feature branch when appropriate and when it is no longer needed

Do not remove unrelated worktrees or branches.

Never delete a branch containing work that has not been merged or otherwise safely preserved.

## 4. Synchronize `main`

After cleanup:

* fetch the latest remote state
* update the local `main` branch to match `origin/main`
* ensure the local `main` branch has no uncommitted or unpushed ticket-specific changes
* confirm that local `main` and remote `main` refer to the same expected commit

Avoid unnecessary merge commits when synchronizing `main`.

Prefer a clean fast-forward update when possible.

## 5. Verify repository state

Before considering cleanup complete, check that:

* the ticket is marked completed
* the PR is merged
* unnecessary ticket-specific worktrees are removed
* unnecessary ticket-specific local branches are removed
* remote branch cleanup has been handled when appropriate
* the local `main` branch matches `origin/main`
* unrelated branches and worktrees remain untouched
* there are no unexpected uncommitted changes

Report any condition that prevented complete cleanup rather than hiding or working around it.

---

# Git Safety

Git cleanup must be conservative.

Never:

* force-delete work that may contain unique commits
* discard uncommitted user changes
* reset unrelated work
* force-push unless explicitly instructed
* rewrite shared branch history without explicit instruction
* delete unrelated local or remote branches
* delete unrelated worktrees

When repository state is ambiguous, preserve work rather than destroying it.

---

# Agent Behaviour

Use repository context instead of repeatedly asking the user for information that can be determined from:

* the ticket
* existing code
* Git history
* repository specifications
* GitHub
* the current branch or worktree
* existing project conventions

Do not require the user to repeat the standard ticket workflow described in this file.

For a normal ticket implementation, automatically carry the work through implementation, verification, Draft PR creation, and moving the ticket to the review state.

When the user indicates that reviewed work is done, automatically carry out the completion and Git cleanup workflow described above.

If a required external action cannot be performed with the available tooling, complete everything that can be performed safely and clearly identify the remaining state.

