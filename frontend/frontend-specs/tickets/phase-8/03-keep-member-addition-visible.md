# Keep member addition immediately available to band leaders

> **Status:** For Review — [Draft PR #57](https://github.com/CaelanRT/bandos/pull/57); implementation and independent review passed 2026-10-04
> **Dependencies:** [Phase 7 shell review](../phase-7/04-review-navigation-and-layout.md) passed; can proceed independently of Phase 8 tickets 01 and 02.

## Objective

Let leaders add existing users by username without revealing and cancelling a temporary form.

## Source Specification

[Phase 8 — Forms and membership refinement](../../09-phase-8-forms-and-membership-refinement.md), sections 1, 4, and 5–6. The current phase's explicit overrides take precedence over earlier behavioral baselines.

## Context

`AddBandMember` currently gates its input behind a reveal state and uses Cancel. Its mutation includes cache completion, permission refresh, rate limiting, uncertain-outcome reconciliation, and unsaved-navigation protection.

## Scope

- Show the authorized username input and Add member action immediately; remove reveal and Cancel controls.
- Use the agreed visible label/guidance and compact wrapping row, and keep the form available after confirmed success.
- Remove only the success notice’s extra separator and preserve existing mutation/recovery and draft protection.

## Out of Scope

- Invitations, account creation, user lookup/search, changing membership permissions, and backend changes.
- Login/Registration changes and changes to other Members page capabilities.

## Acceptance Criteria

- [x] An authorized leader immediately sees an input labelled `Add band member or user` and an adjacent oxblood `Add member` button, with guidance that the person needs an existing BandOS account and is added by username.
- [x] No initial reveal or Cancel step remains; input/button share a compact row where space permits and wrap accessibly at narrow widths.
- [x] Confirmed addition clears the input only after existing mutation/cache completion, retains an announced visible success message without the extra separator, and leaves the form ready for another username.
- [x] Ordinary members have no add form; lost leader access removes/disables the interaction through existing permission recovery.
- [x] The input remains visible with appropriate disabled state/status while pending or reconciling; server errors, already-member/not-found feedback, rate limits, duplicate guards, reconciliation, and cache updates remain intact.
- [x] A nonempty draft retains leave/stay navigation protection and creation-intent behavior without a reveal step; background refresh does not repeatedly autofocus the empty form.

## Testing Strategy

### Unit Tests

- None required.

### Integration Tests

- Update `addBandMember.test.jsx` and relevant creation-intent tests to operate without reveal/Cancel. Verify immediate authorized form, confirmed-success reuse, and nonempty-draft leave/stay protection.
- Retain existing success/cache, uncertain-outcome, rate-limit, permission-loss, and error coverage; check refresh does not steal focus from an empty form.

### Manual / Smoke Verification

- Review leader/member Members views at desktop, 320px, and zoom with keyboard in default, pending, success, error, and reconciliation states.

### Explicitly Not Required

- Duplicating every mutation scenario, adding new membership endpoints, or replacing reconciliation with generic success.

## Implementation Notes

Keep `AddBandMember.jsx`, `useCreationIntent.js`, existing unsaved-navigation hooks, and band query/cache ownership as the behavioral boundaries. [Phase 2](../../03-phase-2-bands-and-membership.md) and its existing username-based API remain authoritative except for explicit reveal/Cancel presentation overrides.

## Definition of Done

- [x] All acceptance criteria are satisfied.
- [x] Required tests from the Testing Strategy are implemented and passing.
- [x] Existing relevant tests pass.
- [x] Repository `npm run lint`, `npm run build`, relevant `npm test -- ...` commands, and `git diff --check` pass; no separate typecheck command currently exists.
- [x] No known regression exists within the behavior touched by this ticket.
- [x] No out-of-scope work was introduced unnecessarily.

## Follow-up Work

Ticket 04 reviews Phase 8 before Phase 9.

## Implementation Verification

- Leaders immediately see the labelled username input and adjacent oxblood Add member action; the row wraps at narrow widths. Reveal and Cancel controls are removed.
- Confirmed additions retain the announced success notice without its extra separator, clear the username after cache completion, and leave the form ready for another addition.
- Existing permission recovery, validation/server errors, rate limits, mutation/cache coordination, uncertain-outcome reconciliation, creation-intent focus, and dirty navigation protection remain intact.
- Focused member-addition, creation, and session suites: 73 tests passed. Full `npm test`: 399 tests across 33 files passed.
- `npm run lint`, `npm run build`, and `git diff --check` passed; lint retains the existing `EditEvent.jsx:41` warning. No separate typecheck command exists.
- Chromium with controlled API fixtures passed at desktop (1440px), 320px, and native 200% zoom (1280px window / 640 CSS pixels). Default, pending, success, error, reconciliation, and ordinary-member views checked, including keyboard Enter/Tab, visible focus, disabled states, success separator removal, repeated addition, dirty Keep/Discard navigation, and no horizontal overflow. Screenshots inspected.
- Initial full-suite run hit a timing race in the new creation-focus test and one failure in an unchanged session test. The focus test now awaits creation-marker consumption; focused and full reruns passed.
- Impeccable detector reported no findings. Independent `review-ticket` review: **PASS**, all six acceptance criteria satisfied, no blocking or non-blocking findings.
- Live backend, real devices, and other browser engines were not tested. The combined Phase 8 review remains owned by ticket 04.
