# Bandos Frontend Master Implementation Plan

> **Status:** Approved implementation baseline; feature-level discovery remains required
> **Frontend:** React 19, Vite, vanilla JavaScript and JSX
> **Backend source of truth:** [`../../backend/backend-specs/00-api-contract.md`](../../backend/backend-specs/00-api-contract.md)
> **Design direction:** [`../../artifacts/design-language.md`](../../artifacts/design-language.md)
> **Last reviewed:** 2026-09-02

## 1. Purpose

This is the master plan for building the Bandos frontend against the implemented API. It records the product direction, information architecture, application-wide behavior, technical baseline, phases, testing posture, and ticket system agreed during the initial Grill Me session.

This is not a substitute for feature specifications. Before implementing each meaningful slice, run focused discovery and write a smaller specification defining flows, component responsibilities, API interactions, states, accessibility, acceptance criteria, and focused tests.

The first pass should be semantic, responsive, and functional without implementing final authored styling. Structure should still support the approved design direction instead of assuming a generic card dashboard.

## 2. Product direction

### Vision and audience

Bandos is intended to become an all-in-one operating system for working musicians and bands: one place to organize work now spread across disconnected tools.

It has two connected perspectives:

- **Personal:** a musician understands work across multiple bands.
- **Band:** leaders and members share one organized workspace for a particular band.

A musician commonly belongs to two or three bands and may lead one while being a member of another. Leadership is band-specific, not an application-wide user type. Leaders and members use the same workspace; leader-only actions appear contextually.

The MVP centers on **events**, the blanket term for rehearsals and performances.

### First-release loop

> A leader registers, creates a band, adds existing Bandos users, and schedules rehearsals or performances. Members log in, find upcoming activity across their bands, and enter each band's workspace.

### Long-term direction

The information architecture should be able to grow toward:

- setlists;
- stored PDF music charts;
- availability;
- notes;
- tasks.

Contracts and payments are possible later additions, not near-term commitments.

Do not display future modules, disabled controls, or placeholder functionality in the MVP. Build the application that currently exists.

### MVP boundaries

Do not imply support for API capabilities that do not exist:

- invitations or join links;
- removing members, leaving a band, role changes, or leadership transfer;
- RSVP/attendance, reminders, or notifications;
- password recovery, email changes, or password changes;
- search, filtering, or pagination;
- reactivation of soft-deleted resources through the application.

Leaders add an existing active user by username. Explain this directly but quietly where needed; do not imitate an invitation workflow.

A potential free-plan cap of three bands is deferred. Do not enforce or advertise it until the backend enforces it authoritatively.

## 3. Experience model

### Personal datebook and band workspaces

Use a hybrid model with a person-first entrance and band-first working spaces:

- Authenticated home is a personal datebook of upcoming events across all bands.
- Selecting a band enters its shared workspace.
- Selecting a datebook event opens it inside the correct band context.
- Global navigation provides access to the datebook, bands, and account.

The home should feel like an agenda/datebook, not an analytics dashboard or full month calendar. Emphasize the next event, then show upcoming events chronologically.

Events are the center of the band workspace. The default band route is its schedule, divided into **Upcoming** and **Past**. Members is a separate section.

### Routes

```text
/                                Personal datebook
/login                           Login
/register                        Registration
/bands/:bandId                   Band schedule
/bands/:bandId/members           Band members
/bands/:bandId/events/new        Create event
/bands/:bandId/events/:eventId   Event detail
/bands/:bandId/events/:eventId/edit
                                 Edit event
/account                         Account settings
/*                               Not found
```

Create/edit route details may change during feature discovery, but band and event detail must have durable URLs. Refresh, back, forward, bookmarks, and protected deep links must work.

### Navigation

Desktop uses a narrow persistent index containing Today/datebook, the user's bands, and account access. Within a band, it reveals the band's available sections. Active state should be a restrained mark or typographic change, not a large colored block.

Mobile collapses this index into a conventional menu while keeping current context visible in the header. Destinations remain links, not a band `select`.

When switching bands from a shared section, preserve the analogous section when valid; otherwise open the selected band's schedule.

### Responsive posture

The MVP is web-based with fully usable mobile behavior. Busy musicians must be able to review and manage supported work in a mobile browser. Mobile prioritizes vertical reading order, direct navigation, and reliable forms. Desktop is the primary heavier-administration environment and may later receive richer editorial composition.

## 4. Event presentation and time

Compact datebook rows show:

- date and start time;
- event name;
- band name;
- rehearsal/performance type;
- location.

They omit timezone. The full route-backed event page may show timezone as part of complete schedule information.

Use the event's original band-local time. Do not convert to the browser's timezone in the MVP.

Timezone is explicit and required on create/edit forms. Do not silently default it. Submit and retain the selected IANA timezone unchanged.

Personal home shows upcoming events only. Band schedules contain both upcoming and past events.

## 5. Technical architecture

### Approved baseline

- React 19 and existing Vite app;
- vanilla JavaScript and JSX;
- React Router;
- TanStack Query;
- React state for forms;
- shared plain JavaScript validation functions;
- optional JSDoc for important models/contracts;
- a small, deliberate dependency set.

Do not add a general state library without demonstrated need. Session identity belongs in a narrow session provider, remote resources in TanStack Query, and transient interaction state locally.

### Proposed structure

```text
src/
  api/             request client, endpoints, normalizers
  app/             providers, routes, application shell
  components/      reusable domain-neutral components
  features/
    auth/
    account/
    bands/
    events/
    datebook/
  hooks/           genuinely shared hooks
  utils/           pure formatting and validation helpers
  main.jsx
```

Organize by responsibility, but do not create abstractions merely to satisfy the tree.

### API boundary

The shared client must:

1. use the configured backend origin plus `/api/v1`;
2. send `credentials: 'include'` on every request;
3. handle JSON requests and responses;
4. parse standard `{ data }` successes and auth success exceptions;
5. normalize errors while retaining code, message, and optional field details;
6. normalize current-user snake_case fields to camelCase;
7. turn malformed responses into controlled client errors;
8. avoid automatic mutation retries.

Never read, store, or infer an auth token. The `bandos.sid` cookie is HttpOnly and server-owned.

### Cross-band aggregation

The backend has no cross-band event endpoint. For the MVP:

1. fetch the user's bands;
2. fetch each band's events in parallel;
3. join each event with its band summary;
4. combine and order upcoming events;
5. retain useful partial results if one band request fails.

Two-to-three bands makes this reasonable. Hide aggregation behind a feature query function/hook so a future user-scoped endpoint can replace it without rewriting the page.

## 6. Application-wide behavior

### Sessions

Initial load calls `GET /users/me` and represents checking, authenticated, and signed-out states. Do not flash auth or protected screens while status is unknown.

After Login or Registration, fetch `/users/me`; never derive identity from the auth message. On `AUTHENTICATION_REQUIRED`, clear session and private cached data, then redirect to Login.

Preserve only validated internal destinations through Login, never external redirect URLs. Without an intended destination, go to the personal datebook. Logout clears private state and returns to Login.

### Permissions

- Members and leaders view schedules, events, and active members.
- Only leaders see supported band, member, and event mutations.
- Hidden controls are not a security boundary.
- Mutations handle `LEADER_REQUIRED` in case roles changed.
- Never show disabled controls for unsupported or unauthorized actions.

### Feedback and recovery

Use the narrowest useful feedback:

- field errors beside controls;
- form errors within forms;
- resource errors within the affected page/section;
- brief global notifications for cross-page outcomes.

Required recovery:

- `AUTHENTICATION_REQUIRED`: clear private state and redirect to Login;
- `LEADER_REQUIRED`: invalidate role data and explain the permission change;
- `BAND_NOT_FOUND`: clear band context and offer the datebook;
- `EVENT_NOT_FOUND`: clear event context and offer the band schedule;
- `EVENT_ALREADY_STARTED`: preserve values, explain editing is closed, and offer detail;
- `TOO_MANY_ATTEMPTS`: show the message without encouraging immediate retry;
- unexpected mutation failure: offer stable recovery without claiming the mutation was not applied.

Do not automatically retry mutations. Specify conservative query retry behavior per feature.

### Forms

- Use explicit Save and Cancel; never auto-save.
- Mirror meaningful backend validation for quick feedback.
- Treat backend validation as authoritative.
- Map `details[].field` to controls.
- Preserve correctable input after failure.
- prevent duplicate submissions while pending.
- Use visible labels and associated errors.
- Send only recognized fields in exact contract shapes.

Frontend validation must protect the backend gaps on profile editing and deactivation.

### Destructive actions

Event deletion, band deletion, and account deactivation require clearly worded confirmation dialogs. Typed-name confirmation is not required. Name the target and explain its visible removal. Do not describe soft deletion as temporary or promise recovery.

Post-success destinations:

- deleted event → band schedule;
- deleted band → personal datebook;
- deactivated account → signed-out/Login state.

## 7. Delivery phases

Each phase is an epic composed of outcome-based tickets. Tests and documentation belong inside the relevant ticket.

### Phase 0 — Foundations

**Status:** Complete (2026-09-03)

**Outcome:** A stable technical skeleton supports user-facing slices.

Deliverables:

- dependencies and test harnesses;
- environment-based API configuration;
- request client, normalized errors, and current-user normalization;
- TanStack Query defaults;
- provider composition and route tree;
- semantic application-shell skeleton;
- shared validation/formatting conventions;
- removal of the Vite starter.

Complete when build/lint pass, representative client tests prove credentials and normalization, routes render under real providers, and feature screens need not reinvent transport/error parsing.

### Phase 1 — Authentication

**Outcome:** Users can register, log in, restore sessions, follow protected links, and log out.

Deliverables:

- session bootstrap;
- Login and Registration;
- protected and signed-out-only routing;
- safe destination restoration;
- `/users/me` retrieval after authentication;
- logout and expired-session transitions;
- credential, validation, and rate-limit feedback;
- mobile-usable semantic forms.

Complete when no auth flash occurs, redirects are deterministic, expiration clears private state, and focused tests cover bootstrap, success, invalid credentials, and restoration.

### Phase 2 — Bands and membership

**Outcome:** Users navigate bands, create one, inspect members, and leaders perform supported management.

Deliverables:

- global navigation and responsive band switcher;
- zero-band state with quiet username-sharing guidance;
- band creation;
- band workspace shell;
- Members page;
- leader-only add-by-username, rename, and delete;
- inaccessible-band and permission-change recovery.

Complete when leader/member views share one structure, only supported actions appear, switching works on mobile/desktop, and mutations update every affected cache.

### Phase 3 — Band schedules and events

**Outcome:** Members use upcoming/past schedules and leaders manage the event lifecycle.

Deliverables:

- Upcoming/Past band schedule;
- route-backed event detail;
- leader-only create, edit-before-start, and delete;
- explicit timezone selection;
- validation for dates, times, future start, and same-day end;
- `EVENT_ALREADY_STARTED` recovery;
- loading, empty, inaccessible, and failure states.

Complete when date/time/timezone remain separate, compact rows omit timezone, members receive no mutations, historical rules match the backend, and caches remain consistent.

### Phase 4 — Personal datebook

**Outcome:** A musician immediately understands upcoming work across all bands.

Deliverables:

- parallel cross-band aggregation;
- emphasized next event;
- chronological event index with agreed row data;
- links into the correct band context;
- no-upcoming-events state;
- partial loading/failure and inaccessible-band behavior.

Complete when one failed band does not destroy useful results, requests are parallel, views share normalized data, and mobile is strongly scannable.

### Phase 5 — Account and resilience

**Outcome:** Users maintain supported profile fields, deactivate accounts, and recover from global edge cases.

Deliverables:

- profile viewing/editing;
- account deactivation with password confirmation;
- deterministic signed-out transition;
- not-found experience;
- final stale-permission/deleted-resource behavior;
- state-consistency review;
- responsive and accessibility audit;
- critical-flow regression tests.

Complete when validation protects backend gaps, every route has recovery behavior, keyboard/focus/labels/zoom/narrow widths are checked, and build/lint/focused tests pass.

### Phase 6 — Visual implementation

**Outcome:** The functional app expresses the approved design language without changing behavior.

Deliverables:

- tokens, typography, spacing, color, rules, and states;
- desktop/mobile compositions;
- rows and indexes instead of gratuitous cards;
- restrained raised surfaces;
- state-driven motion and reduced-motion support;
- contrast, focus, legibility, and visual QA.

Governing ideas: “contemporary musician's stationery,” “software composed like printed matter,” and “conventional interaction, unconventional composition.”

## 8. Testing strategy

Testing is limited and risk-based.

Use:

- **Vitest** for validation, normalization, aggregation, and formatting;
- **React Testing Library** for sessions, routing, permissions, and representative forms;
- **Playwright** for very few critical journeys.

Prioritize:

1. API credentials and normalization;
2. session states and protected destination restoration;
3. leader/member controls;
4. one representative form's client/backend errors;
5. datebook aggregation and partial failure;
6. cache invalidation after mutations;
7. the core first-release browser journey.

Avoid large snapshots, tests of static markup, duplicated assertions across layers, exhaustive library tests, and coverage-percentage targets.

## 9. Outcome-based ticket system

### Philosophy and sizing

A ticket is a user-visible or system-enabling outcome that can be built, reviewed, and verified independently.

Good titles:

- **Restore an authenticated session on application load**
- **Allow a leader to add an existing user to a band**
- **Show upcoming events across all of a musician's bands**

Avoid titles about files, folders, CSS, or adding tests. Those are implementation details within an outcome.

A good ticket:

- produces one coherent outcome;
- has one primary actor;
- can be demonstrated independently;
- includes applicable non-happy states and focused verification;
- avoids several unfinished sibling dependencies;
- fits one implementation/review cycle.

Split only when outcomes are independently valuable or span unrelated routes/permissions—not because multiple files are involved. Foundation tickets may express system outcomes but must name what they unblock and prove their boundary.

### Required ticket template

```markdown
# Outcome-oriented title

## User/system outcome
Who benefits and what becomes possible.

## Context
Why this slice exists, relevant decisions, and its phase.

## In scope
Concrete included behavior.

## Out of scope
Nearby behavior deliberately deferred.

## Routes and access
Frontend routes and allowed users.

## API contract
Endpoints, shapes, normalized responses, and expected errors.

## Experience and states
Happy path plus applicable loading, empty, validation, submitting,
success, unauthenticated, unauthorized, not-found, and failure states.

## Acceptance criteria
Observable, testable completion statements.

## Verification
Focused automated tests and manual checks.

## Dependencies
Only prerequisites or backend capabilities that truly block work.

## Decisions and follow-ups
New decisions and intentionally deferred work.
```

Every heading must be considered. Mark it not applicable when omission would be ambiguous.

### Workflow

1. Select the next phase outcome; do not ticket the long-term product speculatively.
2. Run a focused Grill Me session.
3. Write/update its feature specification.
4. Derive the smallest coherent ticket sequence.
5. Implement one ticket through behavior, tests, and relevant docs.
6. Verify acceptance criteria before starting a dependent ticket.
7. Record discoveries affecting later work.

Prefer vertical slices after foundations. A Login ticket includes its route, form, API call, errors, session update, redirect, accessibility, and focused tests.

### Definition of ready

A ticket is ready when its outcome/scope are clear, product decisions are answered, backend behavior is confirmed, prerequisites are identified, non-happy states have criteria, and no open question would materially change implementation.

### Definition of done

A ticket is done when criteria pass, focused tests pass, build/lint pass when affected, keyboard and narrow-width behavior are checked, applicable states are handled, no unsupported capability is implied, and relevant docs are current.

## 10. Feature-specification requirements

Before implementing a meaningful slice, document:

1. goal and non-goals;
2. routes and access;
3. user flows;
4. component responsibilities, not premature file lists;
5. API interactions and normalized models;
6. local/session/server-state ownership;
7. fields and validation;
8. loading, empty, error, permission, and success behavior;
9. responsive and accessibility requirements;
10. acceptance criteria and focused tests;
11. decisions and deferred questions.

The result should prevent another agent from inventing product behavior while leaving normal code choices to the implementer.

## 11. Confirmed decisions

- Shared leader/member workspace with band-specific roles.
- Event-only MVP covering rehearsals and performances.
- Personal datebook plus band workspaces.
- Agenda rather than full calendar.
- Schedule as default band view; Members separate.
- Persistent desktop band index and conventional mobile menu.
- Durable route-backed pages.
- Direct Login and Registration; marketing site is outside this build.
- Protected destination restoration and Login redirect on expiration.
- Field, contextual, and restrained global feedback.
- Clearly worded confirmations; no typed-name confirmation.
- Explicit Save/Cancel; no auto-save.
- Fully functional mobile web; richer desktop composition later.
- Original event-local time; no viewer-timezone conversion.
- Explicit timezone input; no silent default.
- No timezone in compact summaries.
- Upcoming/Past in bands; upcoming only on personal home.
- No disabled controls for unsupported features.
- React Router, TanStack Query, React state, plain validation.
- JavaScript/JSX and a small dependency set.
- Limited, useful, risk-focused tests.
- Styling deferred until functional behavior is complete.

## 12. Deferred feature questions

Resolve during focused Grill Me sessions:

- exact auth, empty, error, and confirmation copy;
- detailed Login/Registration behavior;
- exact band-creation page flow;
- timezone input mechanics;
- event-detail hierarchy;
- date grouping and headings;
- query freshness and safe retries;
- partial-failure datebook wording;
- notification placement/dismissal;
- exact mobile navigation and breakpoints;
- Phase 6 visual-system choices.

## 13. Maintenance

Runtime backend behavior outranks this plan. Update the backend contract first when APIs change, then revisit affected specs and tickets.

Update this master only for decisions affecting multiple features, phases, or overall direction. Keep feature details in focused specs. If a feature decision changes a cross-application assumption, update both documents together.

