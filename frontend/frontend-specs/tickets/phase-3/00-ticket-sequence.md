# Phase 3 Ticket Sequence

> **Status:** Ready for implementation
> **Specification:** [Phase 3 — Band schedules and events](../../04-phase-3-band-schedules-and-events.md)

Implement these outcome-based slices in dependency order. Each ticket includes the applicable access, failure, uncertain-outcome, accessibility, cache-consistency, and verification behavior. No Phase 3 application code is implemented by these documents.

| Ticket | Outcome | Blocked by |
| --- | --- | --- |
| [01 — Establish the event data and schedule boundary](01-establish-event-data-and-schedule-boundary.md) | Validate event traffic and resolve local schedules consistently. | None in Phase 3 |
| [02 — Inspect durable event details](02-inspect-event-details.md) | Open complete, permission-aware event details at durable URLs. | 01 |
| [03 — Browse a band schedule by date](03-browse-band-schedule-by-date.md) | Replace the Schedule placeholder with grouped events and working detail links. | 02 |
| [04 — Create a band event](04-create-band-event.md) | Let confirmed leaders schedule an event through a protected form. | 03 |
| [05 — Edit a future event safely](05-edit-future-event.md) | Let leaders update future events without losing drafts or remote changes. | 04 |
| [06 — Delete an event and verify the phase](06-delete-event-and-verify-phase.md) | Remove future or historical events safely and close Phase 3 verification. | 05 |

Ticket 01 is a focused technical prerequisite. Tickets 02–06 are vertical user-visible slices. Detail precedes Schedule so the first linked schedule row always has a functional destination. They remain separate because each introduces a durable route/query boundary and materially different states. Create/Edit/Delete stay intact because splitting their safety and recovery behavior would expose partial features.

Do not expose Create before ticket 04, Edit before ticket 05, or Delete before ticket 06. Before declaring Phase 3 complete, verify all ticket criteria plus the full leader/member browser journey in specification section 10 and record checks that could not be performed.
