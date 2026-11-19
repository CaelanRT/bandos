# bandOS v1 — Implemented State

> Planning baseline captured 28 October 2026 from repository commit `d11ea0a`. Based on application code, feature specifications, and recorded verification; this is not a fresh live-environment test. Update this snapshot as v1 changes, and keep a separate baseline for each later version.

## What v1 delivers

bandOS v1 is a shared scheduling application for musicians who play in one or more bands. A leader can create a band, add existing users, and schedule rehearsals and performances. Members can see their bands' schedules and a personal datebook combining upcoming events across bands.

This establishes the account, band, membership, and event foundation for a broader band-management application.

## Current functionality

| Area | Built in v1 |
| --- | --- |
| Accounts and access | Register with name, username, email, and password; log in with email/password; restore an existing session; log out. Protected pages require authentication, and expired sessions return users to login with a safe return destination. |
| Personal datebook | Home combines upcoming events from all accessible bands, highlights the next event, and lists later events chronologically. Events link into their band workspace. If one band's events fail to load, successful results remain available with retry controls. |
| Bands and members | Any signed-in user can create a band and becomes its leader. Users can belong to multiple bands with a different role in each. Members can view the active roster; leaders can add existing active users by username, rename the band, and delete it. The add-member form stays available for successive additions. |
| Schedules and events | Each band has date-grouped Upcoming and Past schedules and event detail pages. Leaders can create rehearsals or performances with a name, date, start/end times, timezone, location, and optional description; edit future events; and delete events. Ordinary members have viewing access. |
| Account management | Users can edit first name, last name, and username; view email and plan; and deactivate their account after confirming their current password. Deactivation ends access and removes the user from active member lists while preserving band and event records. |
| Browser experience | Styled responsive interface with desktop band navigation, a mobile drawer, and an account menu. Includes keyboard/focus handling, validation, loading/empty/error states, retry paths, deletion confirmations, unsaved-form warnings, and recovery for missing resources or changed permissions. |

## Rules and limits that matter for planning

- **Band-wide visibility:** Events belong to a band and are visible to its current members, including people added later. There are no event-specific attendees or participation settings. Leaders control band and event changes; leadership is specific to each band.
- **Event timing:** Creation requires a future start and an end later on the same date. Overnight and recurring events are unsupported. An event becomes Past and stops being editable when its start arrives, even if it is still in progress; leaders can still delete it.
- **Timezones:** Create Event automatically uses the browser's configured timezone, which may differ from the venue's timezone. Editing retains an explicit timezone control. Displayed dates/times remain in the stored event timezone; cross-band chronological ordering uses actual start instants. There is no viewer-timezone conversion.
- **Membership lifecycle:** Adding a user is immediate, with no invitation or acceptance step. There is no member removal, leave-band action, role change, or leadership transfer. A leader can deactivate without handing over leadership, leaving no active leader able to manage that band.
- **Deletion and recovery:** Band/event deletion is soft deletion: records remain stored but disappear from normal access. Deleting a band also makes its events inaccessible. There is no in-app restoration or account reactivation.
- **Account and scale boundaries:** Email and plan are read-only; there is no password change/recovery, subscription billing, or enforced three-band cap. Lists have no search, filtering, or pagination. There is no live push synchronization or background polling.
- **Broader tools:** No RSVP/availability, attendance, reminders, notifications, external calendar sync, setlists, chart/PDF library, standalone notes/tasks, contracts, or payments. Event descriptions provide the existing place for basic event notes.

## Technical and delivery baseline

The application uses a React frontend, an Express API, PostgreSQL data storage, and database-backed cookie sessions. A combined application container serves the frontend and API; Docker Compose provides a separate persistent database. Runtime security configuration, readiness, graceful shutdown, and container verification tooling are implemented.

Recorded frontend and container reviews cover core journeys and recovery behavior. A manually triggered ECR image-publication workflow exists, but repository deployment tickets still mark AWS provisioning, release/recovery, and staging-to-production promotion as pending. This snapshot does not establish that a production deployment is running.

## Possible v2 directions

These are brainstorming candidates, not committed scope:

- **Complete membership management:** Invitations/join links, removal, leaving, and leadership transfer; handle leader deactivation explicitly.
- **Coordinate participation:** Availability, RSVP, event-specific lineups, and conflict warnings across a musician's bands.
- **Expand scheduling:** Recurring rehearsals, overnight events, venue-aware timezone selection, calendar export/sync, and reminders.
- **Add music preparation:** Setlists, a shared chart/PDF library, and event-linked notes or tasks built on existing band access.
- **Improve everyday account and browsing tools:** Password recovery/change, email updates, search/filtering, and pagination as usage grows.
- **Finish operational readiness:** Confirm AWS release status, exercise backups/restore and rollback, and complete controlled deployment/promotion automation.

## Reference points

- [Frontend product plan and original scope](../../../frontend/frontend-specs/00-frontend-implementation-plan.md)
- [Backend API contract](../../../backend/backend-specs/v1/00-api-contract.md)
- [Completed navigation, forms, and event refinement review](../../../frontend/frontend-specs/tickets/phase-9/04-verification-result.md) — later implementation supersedes some older spec status labels.
- [Container verification](../../../product-specs/tickets/containerization/06-verification-results.md) and [deployment tracking](../../../product-specs/tickets/containerization/00-ticket-sequence.md)
