# Sales CRM — Dashboard, Lead Development, Routes, and Handoff

## Delivered behavior

The default Sales CRM page is Dashboard. Eight colored KPI cards, activity lines, upcoming decision-month annual opportunity values, stage doughnut, and interested-service doughnut use saved records. There are no synthetic live leads or fabricated chart figures. Dashboard filters apply to selected leads; log totals are lifetime for those leads, activity chart is six months, and future values are unweighted estimates rather than booked revenue. Win rate is Won / (Won + Lost).

Tabs: Dashboard, Pipeline, Leads (open only), Follow-Ups, Route Planner, Relationships, Won, Lost, and Stage Settings. Admin module tab grants control availability. Stage Settings editing follows its explicit Edit grant. Lead writes remain limited to assigned reps or existing Account Management department-head/owner authority. Owners and each route author can see saved route plans; other reps cannot read those plans.

Lead profiles capture property address/type/units, current service, interested service, current towing provider, management company, manager, assistant manager, leasing agent, decision maker, work email/phone, expected decision, notes, and next action/date. Empty profile data is not rendered as Not Recorded. Quick call outcomes: Connected, No Answer — Voicemail Left, No Answer — No Voicemail. Visit outcomes: Contact Made With Decision Maker, No Contact With Decision Maker, Office Closed, Office Out for Lunch. Notes are optional when an outcome is selected. Log Email Sent records a completed action; it does not send an email. Activity history shows actor and timestamp. Leads are editable, with optimistic concurrency checks and existing account audit records.

Relationships link the same contact identity to different leads, preserve start/end dates and reason for ending, and support decision-maker identification. End the current Property Manager or Assistant Manager relationship before adding a replacement. Quick free-text contact fields remain available for initial discovery; use Add Person and select an existing contact to establish cross-property history. Historical relationships are never silently rewritten by ending a tenure. Lost snapshots preserve the manager at the time of loss even when lead details later change.

## Annual opportunity schedule

Residential and Mixed use leads with positive whole apartment-unit counts:

| Units | Call In | Basic Patrol | Full Patrol |
| --- | ---: | ---: | ---: |
| 1–199 | $1,500 | $5,000 | $18,000 |
| 200+ | $2,000 | $15,000 | $40,000 |

Values are recalculated server-side and cannot be overridden by sending a manual estimate. Unconfirmed service, absent/invalid units, and commercial-only properties have no automatic estimate because no commercial valuation schedule was supplied. Existing manually entered estimate fields are not treated as this schedule's values. This is opportunity forecasting, not Finance revenue.

## Stages and handoffs

Initial stages: Not Engaged, Engaged, Stalled, Contract Pending, Won, Lost. Legacy stages map on read/save: Prospect -> Not Engaged; Qualified, Meeting, Proposal -> Engaged; Contract review -> Contract Pending. Configuration stores stable IDs and editable labels. Add/remove open stages; a populated stage cannot be removed. Won and Lost IDs retain their semantic workflows even if display labels change.

Saving a Won lead atomically creates a deterministic linked account in Onboarding status, management company if necessary, contacts/affiliations, sales handoff notes, and onboarding tasks. The pending account does not activate service. An onboarding owner can be chosen or the account can enter the pending queue unassigned. Repeated handoff calls do not create duplicate accounts. Conflicting edits roll back the entire transaction. Existing matching account names require review rather than duplicating an account.

Lost requires category, reason, and Yes/No manager re-solicitation eligibility. Optional restriction context is retained. Lost leads move out of the open Leads list to Lost. Loss and eligibility changes create history entries. The system does not send outreach automatically. Re-engaging a Lost lead is an explicit edit; staff must review the historical manager restrictions first.

## Route planner

User chooses 1–12 leads with addresses, orders them using up/down controls, and enters 1–480 visit minutes plus optional 0–240 minute breaks per stop. Starting address defaults to the company yard, but is editable. Optional finishing address adds a final driving leg. Date/time inputs are interpreted in America/Chicago, with invalid dates/DST nonexistent times rejected.

Each route leg requests Google Routes API computeRoutes with DRIVE, TRAFFIC_AWARE_OPTIMAL, BEST_GUESS, and a departure time. The next leg departs after the prior driving duration + visit duration + break. Thus estimates reflect the time of day at each leg, not just a common morning departure. Arrival/departure times, mileage, driving time, visits/breaks, finish time, and total planned day are displayed. Google Maps shows the returned path and numbered destinations that open the matching lead profile. Traffic is an estimate, not a guarantee. API fallback results do not silently become traffic-aware results.

Saved plans preserve user-authored stop order, lead address/name snapshots, visit/break durations, start/finish addresses, and planned departure. They do NOT store Google route geometry or traffic results. Previous plans can be viewed and reused on a future date. Calculation requires a departure at least one minute in the future. These are planned routes, not GPS tracking or proof of an actual visit. Visit logging is separate. Editing/copying a saved itinerary and saving creates a new plan from the UI, preserving earlier plans. The save endpoint also supports authorized version-checked updates.

## Integration setup — required, not configured at implementation

As inspected on October 28, 2026, live configuration did not contain Maps or Gmail credentials. UI therefore shows setup-required states, allows saving itineraries, and never displays fabricated traffic or inbox data.

Configure through Sites environment variables / server environment:

- GOOGLE_ROUTES_API_KEY: server-only Google Routes API key, restricted to Routes API. Enable billing and Routes API. Never expose in browser code.
- GOOGLE_MAPS_BROWSER_KEY: browser-visible Maps JavaScript API key, restricted to Maps JavaScript API and the published Command Post HTTPS origin using website restrictions. The key is expected to be visible in browser requests; it must not share a secret server credential.
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: OAuth web client for Gmail, using the existing Account Management Gmail integration.
- GOOGLE_REDIRECT_URI: exact published origin plus /api/accounts/google/callback, registered as an authorized redirect URI.
- GOOGLE_TOKEN_ENCRYPTION_KEY: secret of at least 32 characters used by the existing encrypted refresh-token storage. Do not rotate casually: existing tokens would need reconnecting.

Google OAuth setup must authorize each intended user. The connected Gmail address must match that user's Command Post sign-in email. Existing integration requests Gmail readonly and send scopes because Account Management also sends email; Sales CRM itself only reads and logs. Existing connected mailboxes are reused, per user. New Sales Gmail History access is a separate Admin tab grant.

Gmail history is loaded on demand from the current user's mailbox using lead/contact email addresses, up to 20 matching threads, with text bodies displayed safely as text. It is not copied into shared Sales records and does not give supervisors access to other users' inboxes. A contact who moves properties may share an email address across tenures: email-address matching may include conversations from both properties; reviewers must use the relationship history and message context. No automatic outbound email is sent by the new Sales functionality.

After credentials are configured, perform a real provider acceptance test: calculate a future two-stop route with long dwell time; verify map, stop clicks, mileage and next-leg departure; connect an authorized test mailbox and verify matched messages and isolation from a second user's mailbox. These live-provider checks were blocked by missing credentials during implementation. Do not report the integrations as live until they pass.

Official API references:
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- https://developers.google.com/maps/documentation/routes/config_trade_offs
- https://developers.google.com/maps/documentation/routes/policies

## Code and persistence

- components/sales/SalesWorkspace.tsx: workspace, leads, activity, relationships, settings, Gmail panel.
- components/sales/SalesDashboard.tsx: real-data KPI and chart projection.
- components/sales/SalesRoutes.tsx: route planning, map, saved itineraries.
- lib/sales/config.ts: stage compatibility, annual values, outcomes, Central-time conversion.
- lib/sales/server.ts: validated transactional lead, relationship, stage, Won/Lost writes.
- lib/sales/routes.ts: private saved plans and sequential traffic API requests.
- app/api/sales: primary data and writes; routes and email subroutes.
- Existing account_records holds opportunity, salesActivity, salesSettings, salesRelationship, salesRoute rows. Complex route/settings payloads use dataJSON. Existing account_audit captures mutations. No new database tables/migration required.
- Existing account_google/account_oauth store Gmail encrypted refresh credentials and temporary OAuth states.
- lib/shared/client.ts supports explicit longer timeouts for multi-leg routing and mailbox history while preserving the 15-second default elsewhere.

## Verification

TypeScript check, production build, and targeted workflow tests. tests/sales-config.test.mjs covers all six annual rates and the 199/200 boundary, missing-value behavior, stage mapping, Central-time seasons and invalid DST/date inputs. tests/accounts/workflows.test.mjs covers 54 workflows including lead ownership/read-only enforcement, loss validation and history, persistent contact moves, atomic Won onboarding, isolated route history, and mocked traffic requests with dwell/break-adjusted departures. Browser review uses isolated synthetic fixtures only; no sample records are written to live production.
