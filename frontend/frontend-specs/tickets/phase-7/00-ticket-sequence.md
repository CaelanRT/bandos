# Phase 7 Ticket Sequence

> **Status:** Ready — tickets created; implementation not started
> **Specification:** [Phase 7 — Navigation and layout refinement](../../08-phase-7-navigation-and-layout-refinement.md)
> **Phase prerequisite:** Phase 6 completed baseline

| Ticket | Outcome | Blocked by |
| --- | --- | --- |
| [01 — Simplify authenticated navigation and account access](01-simplify-navigation-and-account-access.md) | Give authenticated users a compact Datebook/band index and a single header menu for Account and logout. | Phase 6 completed baseline. |
| [02 — Navigate the authenticated app with a mobile drawer](02-navigate-with-mobile-drawer.md) | Let narrow-screen users open the shared navigation in an accessible left-side drawer. | [Phase 7 ticket 01](01-simplify-navigation-and-account-access.md). |
| [03 — Restore ordinary scrolling on Account and long pages](03-restore-document-scrolling.md) | Make Account and other long authenticated pages scroll naturally with the header in document flow. | [Phase 7 ticket 02](02-navigate-with-mobile-drawer.md), so the final drawer and scrolling rules are verified together. |
| [04 — Review the Phase 7 navigation and layout](04-review-navigation-and-layout.md) | Record the required browser review of the complete shared shell before Phase 8 starts. | Phase 7 implementation tickets [01](01-simplify-navigation-and-account-access.md), [02](02-navigate-with-mobile-drawer.md), [03](03-restore-document-scrolling.md) complete. |

Every ticket includes its own acceptance criteria, inherited constraints, exclusions, focused testing strategy, and definition of done. All work is frontend-only and preserves the existing visual system and API contracts.

Implement 01 → 02 → 03, then review 04. Ticket 01 owns sidebar/account-menu composition and active states; 02 owns drawer behavior; 03 owns document scrolling. Phase 8 must wait for the combined shell browser review in 04.
