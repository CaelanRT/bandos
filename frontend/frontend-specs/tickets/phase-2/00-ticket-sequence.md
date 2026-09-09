# Phase 2 Ticket Sequence

> **Status:** In progress — tickets 01–02 complete; ticket 03 next
> **Specification:** [Phase 2 — Bands and membership](../../03-phase-2-bands-and-membership.md)

Implement these outcome-based slices in the recommended order below. Each includes its own behavior, failure/access recovery, tests, and applicable browser checks. Ticket 01 is complete and merged in [PR #24](https://github.com/CaelanRT/bandos/pull/24). Ticket 02 is complete and merged in [PR #25](https://github.com/CaelanRT/bandos/pull/25). Ticket 03 is next and its implementation dependency is satisfied.

| Ticket | Outcome | Blocked by |
| --- | --- | --- |
| [01 — Navigate bands through a responsive shared workspace](01-navigate-band-workspaces.md) | Read bands and navigate responsive workspaces. | None in Phase 2 |
| [02 — Inspect active members in a shared band workspace](02-view-band-members.md) | Inspect active members for either role. | 01 |
| [03 — Create a band and enter its Members workspace](03-create-a-band.md) | Create and arrive at Members; protect unfinished forms. | 02 |
| [04 — Add existing users sequentially without leaving Members](04-add-existing-band-members.md) | Add existing users sequentially. | 03 |
| [05 — Allow leaders to rename a band through protected Settings](05-manage-band-name.md) | Gate Settings to leaders and rename consistently. | 03 |
| [06 — Delete a band with confirmation and consistent access recovery](06-delete-a-band.md) | Confirm deletion and clear access/cache state. | 05 |

Dependency edges express real prerequisites, not permission to implement multiple tickets at once. Tickets 04 and 05 both depend on 03; 05 does not require 04, and deletion does not require member addition. The recommended sequence nevertheless runs 01 through 06 so the full phase journey can be verified at the end.

The new Schedule page is an explicitly approved temporary placeholder; global band selection always opens it. Creation alone opens Members with its add form once ticket 04 is available. Do not expose dead creation, member-add, or Settings controls before their tickets land. Pull-to-refresh is deferred.

Before declaring Phase 2 complete, verify all ticket criteria plus the complete leader/member browser journey in specification section 10. Record automated results and manual checks; unresolved verification remains visible. No tickets in this sequence are implemented merely by creating these documents.
