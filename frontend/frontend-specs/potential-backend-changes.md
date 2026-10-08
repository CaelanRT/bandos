# Potential backend changes

> **Status:** Assessed — no backend changes required for the agreed frontend phases
> **Source:** [Phase 6 user-testing feedback](feedback/phase6-usertestingfeedback.md) and Grill Me decisions, 2026-10-01
> **Scope:** Documentation only; this does not authorize backend implementation or ticket creation

## 1. Assessment

The agreed refinements can use the current frontend routes and API contract. No backend change is a prerequisite for [Phase 7](08-phase-7-navigation-and-layout-refinement.md), [Phase 8](09-phase-8-forms-and-membership-refinement.md), or [Phase 9](10-phase-9-event-experience-refinement.md).

| Feedback concern | Existing support | Decision |
| --- | --- | --- |
| Remove manual creation timezone | [API contract §9.1–9.2](../../backend/backend-specs/00-api-contract.md) accepts a required `timezone` alongside local date/time fields; the frontend already supplies it | Derive the value in the browser and keep the same payload. No endpoint, schema, or database change. |
| Login validation/copy and silent expiration | [API contract §6.2](../../backend/backend-specs/00-api-contract.md) and the existing frontend session boundary support authentication and safe invalid-credential feedback | Change presentation and validation timing locally; retain destination restoration and private-state cleanup. |
| Always-visible member addition | Existing username-based member addition and frontend permission/reconciliation flow | Change the form's visibility and layout, retaining the same authorized mutation and recovery. |
| Drawer, account menu, active states, scrolling, row hover, event date/Back/cog | Existing routes, stored event fields, edit/delete operations, and permission rules | Recompose frontend controls without changing capabilities or stored data. |

## 2. Conditional timezone compatibility follow-up

**No demonstrated blocker:** the contract accepts UTC or runtime-supported IANA-style names containing `/`. Browser detection supplies that kind of value in ordinary environments. Frontend-only recovery covers missing or rejected detection without guessing the schedule.

**Trigger for investigation:** a reproducible case where a valid browser-derived IANA timezone is rejected by the deployed backend because its timezone runtime/data differs from the browser's. A client-supported value does not itself prove server support. This compatibility risk is not evidence that the backend currently fails.

**Potential change, only if demonstrated:** align backend timezone support/canonicalization with the supported deployment environments, and add a regression for the rejected identifier. A timezone-support API would require a separate decision and is not presumed necessary.

**Justification:** automatic timezone creation cannot reliably complete for an affected user if the server rejects the correct zone. A frontend fallback to an unrelated zone would store the wrong event instant; that would violate the agreed schedule semantics. Server compatibility work could then be necessary to eliminate that specific failure while retaining the selector-free UX.

Until such evidence exists, do not add backend work or make it a phase dependency. Do not alter existing event timezones or migrate stored events as part of these refinements.

## 3. Preserved product boundaries

Do not add password-specific credential errors: the API deliberately groups unknown email, wrong password, and inactive account under `INVALID_CREDENTIALS`. The agreed **Invalid email or password** copy needs no contract change.

No timezone inference from band/location, event attendees, invitations, new membership capabilities, session policy changes, or event lifecycle changes are requested. Earlier deferred backend concerns in the event specification are not expanded into this UX scope. Backend files remain untouched.
