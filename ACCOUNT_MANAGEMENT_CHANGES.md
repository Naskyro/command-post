# Account Management refinement

Implemented for the supplied September 6 exports and confirmed operating model.

- Profiles use the full content width, with activity and follow-ups directly below the header. Commercial contacts use facility/business roles. Residential owner fields do not appear on commercial accounts.
- Header shows recorded agreement dates, term, notice conditions and health. Verified source clauses: 3600 Capitol View 30 days; AutoZone Del Valle 10 days; Nexus East 5 days. No renewal dates were invented. Eighty-one agreement references are matched; all but these three still need clause review. Nexus's historical “Limited Patrol” selection is retained as a source note rather than silently mapped to a different contractual service.
- Temporary coverage is restricted to active Account Management and Operations staff. Property and internal limits are separate; day/hour rules support overnight windows and preserve prior effective periods.
- Health uses the context packet's nine weights and four thresholds. Incomplete evidence is “Not assessed”; permit scoring is not applicable to non-Full-Patrol accounts.
- Address/phone import covers 105 matched accounts, without importing CSV contacts, tags or types. Third & Shoal was added from its address record with unconfirmed status/service; no contacts or property type were inferred. The repeatable import never creates further accounts.
- Vehicle history searches VIN, plate/state and call number across permitted courtesy records, damage claims and 4,166 imported calls. Identifiers and actual tow dates can be corrected with source evidence. Historical missing plates stay missing.
- The income export contributes 4,126 matched payments. Three have no matched call. The $331.11 Third & Shoal payment is matched to its newly recorded profile. Payment identities preserve multiple payments per call and avoid duplicate import records.
- Only 26 call records contain an actual towing timestamp. Manager attribution requires a dated, unambiguous tenure and a tow date. An explicit optional estimate uses received date; estimates are labeled. Collections, recorded costs, paid settlements and waived charges remain separate. These are not profit rankings.
- Claims use one durable record in Account Management and Compliance. AM investigates and submits evidence; Operations Director, COO or owners review settlements. Existing permission grants still apply. Decisions lock the submitted facts; payment cannot exceed approval. Updates use version checks and an audit trail.
- Private Gmail inbox search, thread reading, attachments, drafts, reply and sending are implemented. Only explicitly linked account conversations are shared; linked contacts retain conversation history. Google Workspace OAuth runtime configuration and each user's connection are still needed. No live email was read or sent in testing.
- Demo photos are verified images from the Nexus East and 3600 Capitol View property websites. No Maps API or live Street View integration is claimed.

## Validation

TypeScript and production build validation; 31 targeted Account Management tests cover authority, concurrent writes, shared claim projection, privacy, financial import identity, historical tenure attribution, health and vehicle lookup.

## Source provenance

- CallAnalysis (27).xlsx; IncomeSummary (10).xlsx; export (25).csv
- account_manager_software_module_context_packet(2).md
- Google Drive / Tow Agreements / Active
- Property photo sources are recorded on each photographed account.

No database schema change is needed; new record kinds use the existing versioned account-record store. Source data is server-only and returned through permission-checked endpoints. The saved revision is prepared for publishing; this work does not itself update the live site.


## Work queue, relationship context and overtime refinement

- Work queue now has compact colored filter cards, task search, assignee/type filters, All / My tasks / Requested by me scopes, grouped lists and an agenda. Checklist completion drives progress. Undated tasks are “Needs scheduling,” never automatically overdue. Waiting tasks name the party and optional contact, with an optional reminder date; completing them clears the reminder.
- “Request Operations” creates a single durable work order linked to the account. Operations assigns and schedules signage, power washing, flyer delivery, striping or other labor. Shared comments, status, checklists and completion notes appear on both surfaces. Operations staff receive Work Orders access through their default role; custom access settings remain authoritative. Unassigned requests and due assigned work appear in in-app notifications.
- Monthly check-ins include attempted/no-response outreach and retain the response status in the account timeline. Future scheduled outreach and internal notes do not satisfy the check-in.
- Company pickers support creating a management company without leaving the affiliation editor. Contact pickers use names, while roles belong to dated affiliations. Brianna Soliz's McKinney Falls assistant-manager tenure is recorded as November 2024–March 2025 with month precision; her separately recorded Agave East affiliation is unchanged. User-facing dates show the last day/month in the role; the underlying end boundary remains exclusive for historical attribution.
- Relationship profiles include optional food/drink preferences, interests, priorities, work style, dislikes and personal context the contact has shared. These use existing relationship access, do not appear in dispatch or Operations projections, and do not change account health or financial scoring.
- Shared workspace typography, spacing, empty states, cards and navigation are more compact. Dispatch details use “Full Patrol” directly, without redundant service-definition text or a blanket TowCentric notice. Limestone Ridge's Towbook exception remains visible.
- A running nonexempt employee's clock card turns red after 40 hours in the current Central workweek and asks them to verify supervisor approval. This is independent of the week selected for history. Running time, qualifying breaks and approved corrections feed the total; approval never stops or removes recorded hours.
- Supervisors receive in-app overtime alerts for permitted nonexempt hourly and salaried employees. Alerts show elapsed overtime, approved/requested hours and estimated overtime wages. The notification bell and Timeclock refresh every 30 seconds while visible. Alerts are active reminders, not external email/SMS messages.
- Hourly estimates allocate currently approved additional earnings to the regular rate and apply 1.5 times that rate to overtime hours. Salaried nonexempt estimates require a verified overtime hourly rate in the pay agreement. Missing rates, midweek effective pay changes or transition weeks show “Rate review needed”; no salary method is assumed. These are estimates of overtime wages, excluding employer taxes and benefits, not payroll releases. Reference: https://www.dol.gov/agencies/whd/fact-sheets/56a-regular-rate
- Nonexempt employees can request planned additional overtime with “Extra earning opportunity,” coverage, assigned work or other reason; personal financial details are optional. Requests route to supervision. Decisions require another authorized supervisor, cannot alter the submitted facts during approval, and preserve review history.

Validation: TypeScript passed; 77 targeted tests passed across account workflows, shared work orders, reminder timing, history, privacy, payroll, overtime, workweek boundaries, breaks, corrections and access. Production build is checked before saving. Browser/visual testing was not requested. No live clock entries, approvals, financial records, work orders or emails were created during verification.


## Today dashboard, uploads, contact details and apartment photos

- Today shows assigned account count, imported portfolio revenue, revenue per account, a six-month revenue chart, non-overlapping health bands with a separate Not assessed category, and monthly check-in completion. Unanswered attempts count; responses remain separately visible. Scope defaults to the department for leadership and the employee portfolio for account managers.
- Next actions show five priorities at a time with pagination. Recorded agreement ends, renewals and notice dates appear within the next two calendar months. Compact attention links cover paused accounts, signage due, open claims, Operations requests and lower recorded revenue. Revenue comparisons use equal elapsed periods and explicitly identify imported-data coverage and current assignments.
- The work-type dropdown is independent of the previous circular module initialization. Eight requested defaults are available immediately. Add/remove controls save a versioned shared configuration, available in both Account Management and Operations. Retired labels remain on existing orders.
- Claim forms support direct multi-file photo, PDF, EML and MSG upload and selection. File content and access are checked server-side, and shared evidence remains governed by claim permissions. Account and contact profiles support image uploads; replacing an uploaded photo archives the previous one.
- Contact edits repair recognizable mixed email/phone imports while preserving their original text. Personal numbers are separate from property-affiliation work phone/email fields. Historical work numbers stay with historical tenures. Brianna's confirmed Agave East work number is attached to that affiliation. Unclassified legacy numbers are not guessed to be personal.
- Contact profiles organize food, interests, priorities and work style in compact cards. Optional birthday, approximate age with an as-of date, industry start year and years in role are independent; experience and interests are not inferred from age. A LinkedIn search link supports manual matching, and a verified profile URL can be saved. No contact identities or personal facts were automatically gathered.
- User-facing account and tenure amounts say Revenue. Imported payments, waived charges, recorded expenses and settlement payments retain their distinct meanings.
- Added 83 verified website property photos; Nexus East and 3600 Capitol View remain, for 85 photographed profiles. Images are local Site assets, not fragile hotlinks. Photo-source links are available on profiles. Existing uploads take priority. The source catalog records addresses, source/image URLs, file hashes and the 11 entries without a verified usable photograph. Website retrieval dates never update signage inspections or imply a recent photo capture. Only official renderings were found for Cairn Point, so no rendering was presented as a photograph.
- Property names, account addresses, contacts, service levels and inspection history were not changed by the photo research. Former community names are documented in provenance where an exact address establishes the match. Treaty Oaks uses an older, low-resolution image from its official operator.

Validation: 45 targeted Account Management checks passed, including durable shared work-type edits and stale-write rejection, claim/file visibility, email cleanup, health bands, check-in counting, calendar renewal windows, and revenue periods. TypeScript and the production build are checked before saving. All 85 local photo assets are validated against the source catalog. No live account data, claims, emails or work orders were changed during testing. Google Workspace connection setup is still required for live Gmail; Maps automation remains deferred as requested. This revision is saved for review, not deployed.


## Recovery and publication follow-through

- Recovered the saved September 6 refinement and confirmed the eight configurable work types, claim evidence uploads, Today dashboard, contact fields, profile uploads and Revenue terminology were already implemented but awaiting publication.
- Re-ran all 45 Account Management tests and TypeScript validation successfully. Verified all 85 existing photo assets against their recorded hashes.
- Added a verified exterior photo for Wooten Park Apartments from its owner, who documents the rename to Magnolia Flats. Source provenance retains the historical-name match and source address without changing the account name, address or status. Photo coverage is now 86 profiles; 10 remain without a verified usable exterior.
- Rechecked Regency North, Town Lake Villas and Cairn Point. Regency image retrieval was blocked, Town Lake's official gallery has interior images only, and Cairn's building image is a rendering. Missing or ambiguous properties were not assigned substitute imagery.


## Pending accounts and property profile summary — September 7, 2026

- New Property saves a durable account in Pending Accounts and creates the current launch checklist. Five sections track property details, photo, primary contact, signed agreement and launch preparation. Account activation requires the completed profile, verified agreement, completed required tasks and reached launch date. Pending properties stay out of working portfolio totals and Dispatch until activation. Existing active records retain their status.
- Success notices are compact notifications that close after 3.5 seconds; upload confirmations also clear automatically. Department is labeled Settings; paused-account follow-up is separate from onboarding.
- The top property profile now shows account tenure, selected calendar-year revenue with recorded-payment coverage, visitor enforcement, carport availability and enforcement method, schedule rules, and authorized tow callers. Revenue uses signed imported payments, excludes voids, and never annualizes partial data. Missing property facts remain explicitly unrecorded.
- The owner clarified that Citizen House Bergstrom / The Hangar accepts tow authorization only from the property manager, including carport requests. Assistant managers and residents cannot authorize service; late-night service may have to wait for the property manager. This replaces the conflicting imported regional-or-manager note and remains editable. Visitor enforcement was not inferred.
- Property manager cards include email and phone links, profile access, direct edit and Add manager. Work contact details belong to the property affiliation. An optional dated manager replacement ends the prior tenure while preserving its work number, and updates the primary contact in one version-checked transaction.

Validation: all 54 Account Management tests and TypeScript passed. Tests include durable pending progress, activation guards, manager history and stale writes, annual revenue/refunds/coverage, dispatch restrictions and overnight schedules. Production build checked before publishing.


## Account Hub and Sales CRM — September 7, 2026

- Renamed the dispatch-facing Accounts module to Account Hub at the owner's direction while retaining its permission identifiers. It now opens on property search and provides a dedicated call guide, service status, authorized callers, office and manager contacts, patrol limits and schedules, reporting jurisdiction, agreements, signage evidence, and courtesy releases. Revenue and internal account-health assessments are excluded from this view.
- Added editable resident/visitor policy fields to Account Management: physical/digital/both permits, permit platform and display rules, vehicles per leaseholder, visitor section/location, visits per month, duration and consecutive-day limits, resident validation, and EV enforcement. Account Hub shows the same saved fields without guessing unknown policies.
- Shared dispatch handoff threads accept regular or urgent notes, category, plate, VIN, incident date and Towbook reference. Urgent messages notify the assigned manager and active designated backup in Command Post. Managers acknowledge and star notes. Regular notes appear in searchable History after seven days; starred notes and unacknowledged urgent notes stay visible. Replies remain attached to their original thread. Account Management has a dedicated Dispatch inbox and a Today summary; historical dispatch notes are separated from the general contact timeline.
- Sales CRM is a separate working surface with a five-stage open pipeline, drag-to-move and accessible stage selection, follow-up agenda, prospect list, and won/lost history. Prospect forms include property and decision-maker details, company, service, current provider/term, source, estimated annual value, ownership and next action. Dated contact logs and stage changes persist. No example prospects are fabricated.
- Won prospects can be handed to an assigned Account Manager as one pending account, carrying contact/company information and sales notes with an onboarding checklist. The handoff is atomic, retry-safe, prevents duplicate property names, and does not activate service.

Validation: 59 account, sales, and handoff workflow tests passed, including storage durability, retry/stale-write protection, permission boundaries, archive timing, recipient routing, courtesy workflows and a single pending-account handoff. TypeScript and the production build are checked before publishing.
