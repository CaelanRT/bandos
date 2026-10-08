# Phase 9 Ticket Sequence

> **Status:** Ready — tickets created; implementation not started
> **Specification:** [Phase 9 — Event experience refinement](../../10-phase-9-event-experience-refinement.md)
> **Phase prerequisite:** Phase 8 verification ticket 04 passed

| Ticket | Outcome | Blocked by |
| --- | --- | --- |
| [01 — Make Schedule event rows clearly clickable](01-highlight-schedule-event-rows.md) | Give every Upcoming and Past event link clear full-row hover and keyboard-focus feedback. | [Phase 8 review](../phase-8/04-review-forms-and-membership.md) passed. |
| [02 — Simplify event details and management controls](02-simplify-event-detail-controls.md) | Present event title, Back, details, and contextual management in a predictable order without changing event lifecycle rules. | [Phase 8 review](../phase-8/04-review-forms-and-membership.md) passed, including the reviewed Phase 7 menu conventions. |
| [03 — Derive Create Event timezone from the browser](03-derive-creation-timezone.md) | Remove manual timezone selection from Create Event while sending a validated browser-derived zone with the existing local schedule payload. | [Phase 8 review](../phase-8/04-review-forms-and-membership.md) passed. |
| [04 — Review the complete Phase 7–9 frontend refinement](04-review-complete-refinement.md) | Record a combined browser review and account for every Phase 6 feedback item using the approved Phase 7–9 decisions. | Phase 9 implementation tickets [01](01-highlight-schedule-event-rows.md), [02](02-simplify-event-detail-controls.md), [03](03-derive-creation-timezone.md) complete. |

Every ticket includes its own acceptance criteria, inherited constraints, exclusions, focused testing strategy, and definition of done. All work is frontend-only and preserves the existing visual system and API contracts.

Tickets 01–03 can proceed independently after Phase 8 review. Ticket 01 owns Schedule row feedback, 02 owns event detail/management, and 03 owns automatic Create Event timezone and its test audit. Ticket 04 reviews all three phases together and accounts for every feedback item; it does not duplicate sibling acceptance criteria.

No backend ticket or prerequisite is created. The [backend assessment](../../potential-backend-changes.md) permits compatibility investigation only after a reproducible rejection of a valid browser-derived timezone.
