# Phase 8 Ticket Sequence

> **Status:** Completed — tickets 01–04 Completed; [review PR #58](https://github.com/CaelanRT/bandos/pull/58) merged and completion confirmed 2026-10-06
> **Specification:** [Phase 8 — Forms and membership refinement](../../09-phase-8-forms-and-membership-refinement.md)
> **Phase prerequisite:** Phase 7 verification ticket 04 passed

| Ticket | Outcome | Blocked by |
| --- | --- | --- |
| [01 — Validate Login on submission and silence expiration notices](01-refine-login-feedback.md) | Reduce distracting Login feedback while retaining authentication validation and recovery. | [Phase 7 shell review](../phase-7/04-review-navigation-and-layout.md) passed. |
| [02 — Use compact password controls and simplify registration hints](02-compact-password-controls.md) | Give Login and Registration a shared compact password toggle and remove persistent registration length hints. | [Phase 7 shell review](../phase-7/04-review-navigation-and-layout.md) passed; can proceed independently of Phase 8 tickets 01 and 03. |
| [03 — Keep member addition immediately available to band leaders](03-keep-member-addition-visible.md) | Let leaders add existing users by username without revealing and cancelling a temporary form. | [Phase 7 shell review](../phase-7/04-review-navigation-and-layout.md) passed; can proceed independently of Phase 8 tickets 01 and 02. |
| [04 — Review the Phase 8 forms and membership increment](04-review-forms-and-membership.md) | Record the required Login, Registration, and Members review before Phase 9 starts. | Phase 8 implementation tickets [01](01-refine-login-feedback.md), [02](02-compact-password-controls.md), [03](03-keep-member-addition-visible.md) complete. |

Every ticket includes its own acceptance criteria, inherited constraints, exclusions, focused testing strategy, and definition of done. All work is frontend-only and preserves the existing visual system and API contracts.

Tickets 01–03 can proceed independently after Phase 7 review. Ticket 01 owns Login timing/feedback, 02 owns shared password controls and Registration hints, and 03 owns member addition. Coordinate shared auth form edits if working concurrently. Review 04 must pass before Phase 9.
