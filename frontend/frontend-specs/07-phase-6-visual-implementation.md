# Phase 6 — Visual implementation

> **Status:** Ready for implementation
> **Planning source:** [Frontend implementation plan](00-frontend-implementation-plan.md), Phase 6, and the focused Grill Me session on 2026-09-28
> **Design authority:** [bandOS design language v0.2](../../artifacts/design-language.md)
> **Existing baseline:** Functional Phase 0–5 routes, responsive access safeguards, and semantic controls

## 1. Goal and boundaries

The current frontend should express the approved design language across every existing route while preserving its behavior. The personal datebook establishes the visual direction first; its browser review is a checkpoint before the design spreads to the remaining routes. Everyday work should be quiet, with rare bold moments that carry real information or identity.

This phase is a warm light theme. Dark mode, new product features, new routes, new API behavior, new imagery, and a broad component-library rebuild are outside scope. No page should imply that a decorative block is a control. Existing flow, data, permissions, errors, and recovery remain authoritative.

## 2. Visual foundation

Use the design language's paper `#F7F5F0`, surface `#FCFBF8`, ink `#25231F`, graphite `#68645D`, pencil `#969087`, rule `#DDD9D1`, and faint rule `#EAE7E0` as starting foundation colors. Set one recurring graphic ink to a dark wood-toned oxblood, initially `#743C32`; use it for small marks, selected graphic fields, and restrained emphasis. The exact rendering may be adjusted during the datebook browser review while preserving the dark, warm character and accessible contrast. Semantic success, warning, error, and information states stay distinct from the graphic ink and retain text or icon labels.

Use IBM Plex Sans as the primary and display family. Create display contrast with scale, weight, width, and spacing within that family. A serif and a second display family are deferred. Use the design language's 4px spacing base, compact working type, restrained corner radii, rules ahead of shadows, and clear focus treatment. Font loading must have a usable fallback and should avoid making text unavailable while the font loads.

Prefer page structure, typography, aligned metadata, rows, and rules to repeated cards. Cards remain valid for a genuinely discrete object such as the next event. Color fields and blocks may give a page structure without suggesting interactivity. Elevated surfaces are for menus, dialogs, and other objects physically above the page.

## 3. Routes, access, and rollout

The visual pass covers the current protected datebook (`/`), band schedule and subroutes, band creation, Account, Login, Registration, and authenticated or signed-out recovery pages. Existing access rules and route destinations do not change.

Roll out in coherent increments:

1. Establish shared visual primitives through the personal datebook, global band index, its loading/empty/partial-error states, and mobile translation. Review this result in a browser before using it as the baseline for later route tickets.
2. Apply the approved system to the band workspace and schedule.
3. Apply it to event details and event management screens.
4. Apply it to band creation, members, and settings.
5. Apply it to Account and its deactivation flow.
6. Apply it to Login, Registration, and route or resource recovery.
7. Perform cross-route visual, responsive, accessibility, and regression QA.

The later independent route groups may proceed in parallel after the datebook checkpoint where their shared dependencies are ready. A ticket owns the states and responsive translation for its surfaces, not only its default screenshot.

## 4. Experience and states

The datebook's next event may be the main expressive moment: a large meaningful date or event title, precise small metadata, a restrained oxblood field or mark, and clear links. Later events should read as a chronological index with aligned date and metadata columns. Do not repeat the featured event in the later list or turn every event into a card. The no-bands and no-upcoming-events states can use quiet whitespace and one purposeful graphic element while keeping their current actions and guidance.

The band workspace should retain a narrow, legible index and give its schedule, members, and settings a common page identity. Schedules and member lists favor rows and metadata alignment. Event details may carry stronger hierarchy than management forms. Create/edit forms, account forms, Login, and Registration should remain visually straightforward places to write. Dialogs and notices should be legible and visually distinct without adding drama to destructive or error states.

Keep current loading, partial failure, validation, success, permission, deleted-resource, and unknown-route content and actions visible. Style them as part of each surface; do not collapse them into decorative empty states or obscure correction and recovery. Copy changes are limited to clarity needed by the visual presentation; existing behavioral specifications govern meaning.

## 5. Responsive and accessible behavior

Desktop composition can use asymmetry, scale contrast, and occasional interruption of the grid. At narrow widths, translate the same hierarchy into a clear vertical sequence. Keep the existing conventional mobile menu and route-backed navigation behavior. Maintain semantic reading order even when a block or rule is positioned differently. At 320px and 200% zoom, controls and content must remain reachable without horizontal loss.

Maintain readable contrast, visible focus, meaningful labels, keyboard order, and target sizes. Status must not rely on color alone. If motion is added, it should explain an actual state change, remain brief and restrained, and honor `prefers-reduced-motion`; static presentation is acceptable where motion adds no clarity.

## 6. Data and implementation ownership

This is a presentation phase. Existing API endpoints, normalized models, session/query state, field validation, mutation sequencing, and route protection do not change. Shared tokens and base typography belong to the first ticket; route-specific layouts and state styling belong to the corresponding route tickets. Extract reusable components only where repeated structure or behavior justifies them. Do not add dependencies merely to supply decoration.

## 7. Acceptance criteria

- Every current route and its applicable loading, empty, error, validation, success, permission, and recovery states uses the Phase 6 visual language without losing an action or changing its meaning.
- The datebook establishes a reviewed IBM Plex Sans, warm-paper, wood-toned oxblood direction with one informative featured event and a readable later-event index.
- Band schedules and member lists read as structured rows or indexes; forms and high-frequency controls remain predictable; raised cards and shadows are restrained.
- Desktop and mobile compositions preserve hierarchy, reading order, and functional navigation; controls remain reachable at 320px and 200% zoom.
- Focus, labels, contrast, target sizes, status distinctions, keyboard use, and reduced-motion preferences remain accessible.
- Existing route, access, API, and mutation behavior remains intact.

## 8. Focused verification

Use a browser review of the datebook at desktop and narrow widths as the design checkpoint before rolling out subsequent surfaces. For each ticket, inspect populated and relevant non-happy states, keyboard focus, and narrow-width layout. Add focused component or integration tests only when a presentation change alters meaningful structure or interaction; avoid screenshots or static-markup snapshots as a default gate. Run the relevant existing tests, lint, build, and whitespace check for implementation tickets. The final pass checks every current route at desktop, 320px, and 200% zoom, with keyboard and reduced-motion settings, and records any concrete findings and fixes.

## 9. Decisions and deferred work

The session chose datebook first; quiet working screens with rare bold moments; IBM Plex Sans for working and display type; a dark, warm oxblood with wood undertones; a light theme; every existing route in incremental steps; and browser review of the datebook before wider rollout. Exact compositional details can be resolved during the datebook checkpoint within these boundaries. A dark theme, serif voice, second display family, and new artist imagery require separate decisions later.

### Datebook browser checkpoint — 2026-09-28

Reviewed the populated datebook, no-bands and no-upcoming-events views, loading, full failure, and a partial band failure in Chromium at desktop and 320px. Checked the mobile menu's open and Escape focus return, and confirmed the datebook reflows without horizontal overflow at a 640px CSS viewport (the effective width of a 1280px window at 200% zoom). The featured event uses one oxblood field; later events remain chronological rows. Keep `#743C32` as the graphic ink. The browser pass exposed an old shell display rule that prevented the row grid from rendering; that rule and the whole-main focus outline were corrected before this checkpoint was accepted. Later route tickets may use these tokens and the datebook composition as their baseline.
