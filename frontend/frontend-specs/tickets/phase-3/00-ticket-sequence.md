# Phase 3 Ticket Sequence

> **Status:** Completed — see [Phase 3 verification result](07-verification-result.md)
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

Implement these outcome-based slices in dependency order. Each ticket includes the applicable access, failure, uncertain-outcome, accessibility, cache-consistency, and verification behavior. No Phase 3 application code is implemented by these documents.

| Ticket | Outcome | Blocked by |
| --- | --- | --- |
| [01 — Establish the event data and schedule boundary](01-establish-event-data-and-schedule-boundary.md) | Validate event traffic and resolve local schedules consistently. | None in Phase 3 |
| [02 — Inspect durable event details](02-inspect-event-details.md) | Open complete, permission-aware event details at durable URLs. | 01 |
| [03 — Browse a band schedule by date](03-browse-band-schedule-by-date.md) | Replace the Schedule placeholder with grouped events and working detail links. | 02 |
| [04 — Create a band event](04-create-band-event.md) | Let confirmed leaders schedule an event through a protected form. | 03 |
| [05 — Edit a future event safely](05-edit-future-event.md) | Let leaders update future events without losing drafts or remote changes. | 04 |
| [06 — Delete an event](06-delete-event.md) | Remove future or historical events safely. | 05 |
| [07 — Verify Phase 3](07-verify-phase.md) | Verify the completed event workflows and close the phase. | 01–06 |

Ticket 01 is a focused technical prerequisite. Tickets 02–06 are vertical user-visible slices, and ticket 07 verifies them together. Detail precedes Schedule so the first linked schedule row always has a functional destination. Create/Edit/Delete stay intact because splitting their safety and recovery behavior would expose partial features.

Phase 3's ticket criteria and leader/member browser journey were verified. The results are recorded in [ticket 07's verification record](07-verification-result.md).
