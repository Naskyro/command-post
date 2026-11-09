# People & HR Workflow Simplification — October 27, 2026

## Why This Update Exists

The user demonstrated two unnecessary sequences: a lengthy offboarding form that rejected saving until the employee was separately marked Former and their access disabled in another module, and an Employee Setup wizard split into Employee Details and Initial Access. The instruction is to make ordinary HR changes through one coherent form and one save, with the software doing the related work. Separate review, signature, or actual external completion must remain explicit; reducing navigation must not create another checkbox that pretends the underlying work happened.

This update builds on version 44. It changes HR workflows and the shared personnel/access policy used by their forms, without redesigning other modules or entering real employee transactions.

## End Employment / End Assignment

An authorized reviewer selects End Employment directly from the employee profile (End Assignment for contractors). One compact form collects departure type, last day, categorized reason, and rehire eligibility. Additional personnel notes are optional; Other requires a brief reason. The action is available only to the assigned scoped Manage Offboarding responsibility. Self-separation and protected owner accounts are excluded from the routine employee path.

A successful save atomically does all of the following:

1. Stores an immutable, timestamped decision with actual acting user identity and the submitted facts.
2. Sets the personnel record to Former and records the end date.
3. Disables Command Post access immediately.
4. Creates three assigned pending HR follow-ups for final time/final-pay handoff, equipment and physical access, and benefits/personnel records.
5. Writes protected HR and personnel audit entries.

The date may be today or an earlier factual departure date. This is not a future scheduler: access ends when saved, and the form says so. Date validation rejects a future date or one preceding the recorded start date. The original employment, payroll, bank, benefit, evidence, and time records remain intact. An open clock is not truncated; it becomes part of the final-time review. No payroll payout, carrier cancellation, external email, or physical key recovery is implied.

The decision appears as Departure Recorded. Closeout progress is derived from the actual follow-up tasks, not from a manually selected completion flag. The reviewer can work those follow-ups from the same employee profile or HR queue. Historical offboarding reviews remain available as historical records. The generic employee editor can no longer move an active employee to Former without recording the actual departure through this action.

The persistence transaction uses version guards for the target, acting-user authority and relevant reporting-chain records. A failed write rolls back all status, access, task, and audit changes. Repeating an identical submission returns the prior result without duplicate tasks; changing facts under the same request key is rejected.

## Fewer Screens and Saves

| Workflow | Previous Friction | Revised Behavior |
| --- | --- | --- |
| Create Employee | Employee Details, Next, Initial Access, Save | One form and one Create Employee save; optional access details stay in the same form |
| Corrective Action PDF | Save, modal closes, find saved notice, generate | Save & Generate PDF uses the server-saved notice in one action |
| PDF retry after saved notice | Risk of duplicate or stale re-save | The editor retains the returned saved version and retries generation from it |
| Verify Signed Corrective Copy | Underlying notice closes | The notice remains open for the separate publish action |
| First Onboarding Record | Create checklist before working a task | First task action saves the checklist automatically |
| Generate & Attach Offer / Job Description | Save details, generate, upload, assign, save again | One action persists details, generates, uploads, and assigns the document |
| Use This Version | Select a document, then save checklist | Selection persists immediately |
| Manager Uploads Signed Offer / Job Description | Upload then separately link to checklist | Upload saves its context and assigns the correct employee/document step |
| Onboarding Refresh | Saved version remounts and returns to checklist | Current screen is preserved; version checks protect unsaved changes |
| Promotions / Role Changes | Note only, then navigate elsewhere for actual employee changes | Direct Update Role & Reporting and Update Pay Agreement actions |
| Payment Details | Leave profile, locate pay/benefit area, click edit | Direct Edit Pay Agreement and Edit Benefits actions |
| Benefit Employment Class | Editable field later rejected for mismatch | Reads the saved employee classification; class is maintained in Employee Details |

Employee signature, signed-copy verification, employer I-9 review, direct-deposit authorization, payroll review, and carrier confirmation remain actual distinct responsibilities. They are not replaced with blanket completion actions. Department creation/renaming, inline position creation, headshots, and quick performance notes were already direct enough and were retained.

## Internal Authority Level

The company tiers are Coordinator, Manager, Department Lead / Director, and Executive. Department Lead and Director share a single tier. Job title and assigned supervisor remain separate. Dispatchers are equivalent to Coordinator; the application does not infer or bulk rewrite a person’s level from their name or title.

Authority Level is internal access-setup metadata. It is not displayed in employee-facing profiles, the organization chart, or directory columns. Authorized users select it in Employee Details or the new-employee form. Admin displays the current level and controls individual access checkboxes; changing the level is done in Employee Details. Ordinary employee/self responses do not expose it. Earlier Department Lead and Director values are normalized for compatibility without a bulk data migration.

### Bounded Permission Presets

| Level | Defaults Added by the Preset |
| --- | --- |
| Coordinator | Employee self-service: own HR records and onboarding, Timeclock clock actions and requests, own paystubs, assigned SOP acknowledgments |
| Manager | Coordinator defaults plus team-scoped personnel viewing and performance/coaching records, with edit-level HR Overview, Employees, Performance, and Employee Relations navigation |
| Department Lead / Director | Manager defaults plus personal expense submission through Finance → My Spending |
| Executive | Same bounded starting defaults; confidential company-wide decision powers remain explicit Admin assignments |

The internal application role maps to Employee, Supervisor, and Department Head respectively; Executive maps to non-owner Department Head for existing access primitives. An existing Owner remains Owner. The level itself never creates an Owner account. Job title, reporting line, department, module access, and action-specific responsibility scopes remain separate fields.

New-hire Initial Access checkboxes immediately reflect the selected tier. Checking or unchecking an item is preserved when selecting another tier; the final reviewed choices are the choices saved. Server validation rejects delegation beyond the acting user's authority. Existing-employee changes require scoped user-access administration, cannot promote the actor themself, and cannot assign a higher tier than the actor. Protected owners remain outside ordinary employee changes.

For existing employees, the server preserves prior effective grants and deliberately selected Admin overrides. It writes Custom access to prevent legacy role defaults silently adding financial or company-wide access. It tracks which grants the preset added or upgraded and their previous values. A later demotion removes only template-owned additions or restores their former level. An explicit Admin unchecked box or View-only override remains in force and is not silently restored by another promotion. Template version, applied time, acting name/ID, and the ordinary personnel audit record identify the change. No existing user is bulk reassigned by this deployment.

Authority must never be interpreted as ownership, payroll release, bank-account approval, termination permission, spending approval, or an automatically issued physical company card. Actual sensitive responsibilities remain separately assignable through Admin. Expense-form access means the user can document their own spending; card issuance and spending authorization remain separate company decisions.

### Necessary Finance Access Boundary

This update does not redesign Finance. It corrects a boundary that would otherwise turn the new role presets into unintended financial access: My Pay and My Spending show only the user's own data. A reporting relationship or Department Head role alone cannot expose another employee's pay or expenses. Other employees' payroll records require explicit Payroll access plus the existing employee scope; expense viewing/editing requires Outflows access at the appropriate level plus existing scope. Reviewing another employee's expense requires Outflows Edit, and self-approval is blocked. Partial payroll views do not expose shared run-wide attachments or other employees' identifiers.

## Full-Height HR Module Navigation

Selecting People & HR opens a second full-height black navigation panel directly to the right of the main Command Post menu. It uses white icons and labels, and a white triangle at the selected section. The rail is 180px wide on desktop; repeated module branding and the My Profile shortcut were removed at the user’s request. The highlighted People & HR entry in the main menu supplies module context. The panel contains Overview, Employees, Hiring & Onboarding, Performance, Pay & Benefits, Tasks & Compliance, Reports, and Settings, subject to the existing HR visibility rules. Onboarding-only accounts retain their restricted onboarding view.

The former boxed navigation inside the HR page is removed. The repeated People & HR page heading and overview breadcrumb are also removed. The dashboard retains its meaningful Workforce Overview title, with Refresh alongside the existing dashboard actions rather than an otherwise empty title row. On screens at least 1,280 CSS pixels wide, the content and global header shift to the right of the two navigation panels, with no overlap. The HR menu has its own scroll area so its lower items remain reachable on short displays. The original Command Post menu retains the selected workspace theme; the HR panel stays black as requested.

Below that width, HR Menu opens the same black navigation as a full-height drawer. Selecting a section closes it. The close button, backdrop, and Escape also dismiss it; focus is contained while open and returned when closed. On phones, the existing company-menu button remains available separately. Leaving People & HR removes the secondary panel and restores the normal content width. Employee-profile section tabs remain inside the employee profile because they describe that specific employee, not the module.

## Validation and Rollout

Final pre-publication checks: 177 HR and Finance regression tests passed, TypeScript passed, and whitespace validation passed. Browser checks used the actual application shell with synthetic API responses and persistence disabled. They covered the desktop full-height panel, employee profile layout, mobile drawer selection and Escape dismissal, removal of the panel/content offset on leaving HR, reopening HR, the compact departure form, one-form Employee Setup, and authority-preset choices with an explicitly removed expense permission surviving a subsequent level change. The production build is required by the publication helper before version creation.

No live employee was terminated, promoted, assigned new permissions, or given a payroll/bank entry as a test. Browser checks use synthetic personnel with saving disabled. Server tests exercise real SQLite transaction rollback, conflict handling, idempotency, scoped permissions, and record preservation. The existing site audience and encryption key are preserved.

Future-dated scheduled separations, ACH transfer execution, automatic carrier enrollment/cancellation, and finance posting remain separate integration work. This update must not be represented as completing those integrations.


## Context and Roster Audit Follow-Up

- Pay & Benefits and Hiring pickers use current personnel (Active, Onboarding, Leave), sorted alphabetically. Former records remain accessible under Employees → Former Employees. Moving from a former profile into pay clears the stale historical selection. This changes view selection only, not payroll history, employment status, or authorization.
- Add New Employee appears only on the overview, current directory, and hiring workflow. It is absent from former records, employee profiles, Settings, Reports, and other unrelated views. Creating a record opens that employee’s onboarding profile.
- Former Employees supports email search, a real no-results state, and returning from a profile to the former list. The current directory’s All option means all current employees.
- Fixed-size photo containers cannot grow or shrink into ovals; actual headshots use a circular crop, and initials remain the fallback. The photo-edit badge has its own class so it cannot restyle an uneditable avatar.
- The hiring landing page lists pending onboarding personnel. Continue Setup opens the chosen person and returns to Hiring & Onboarding. Former personnel and cleared/cancelled onboarding are excluded from the pending setup roster.
- Shared HR queue follow-ups use the source record’s person ID, never the previous selector’s person. New tasks and TWC follow-ups prompt for the person. The TWC personnel-file action also requests a person rather than opening a hidden prior selection.
- New task, reporting, screening, offboarding, and final-pay assignments exclude former staff. Saved historical assignments remain explicitly labelled.
- Leave links from the HR overview open Timeclock’s Time Off view. Generic Finance links are labelled Open Finance rather than promising a direct paystub destination.

Validation includes roster regression tests, TypeScript, production build, and synthetic UI checks without production personnel mutations.

## Personnel details and hiring follow-up

The owner clarified that the existing resume upload is already visible. It remains in place. Personal & Work now exposes one protected personnel-details form for home address, personal phone, birthday, emergency contact, voluntarily recorded allergy information, and driver's license/state ID details. Identity numbers are masked until deliberately revealed. The existing employee hire date drives calendar-based length of service and the next work anniversary. Former-worker service ends on the recorded separation date; a missing end date never implies ongoing employment.

Private details use a separate encrypted HR record and endpoint. Access requires employee self-service or the assigned personnel/onboarding responsibility within scope. Generic finance roster and broad HR record readers do not receive these fields. Writes preserve original creation stamps, validate fields, enforce record versions, and retain audit history. Editing these details does not modify role, pay, access, employment status, or statutory verification records.

Hiring & Onboarding previously opened the selected employee's setup checklist, which made an owner with an incomplete record look like a candidate. The management landing now shows job openings. A vacancy records the job title, department, job description, pay arrangement, optional amount and additional terms, target close date, and status. Drafts may be incomplete; opening a position requires its description, compensation terms, and target close date. A simple base rate requires no redundant pay narrative.

Each opening has its own manually entered candidates. Candidates are separate from employees until Start Onboarding creates the employee setup record. Existing candidates can instead be linked to an authorized current employee, avoiding duplicate personnel records. The candidate and optional onboarding draft are linked atomically; the new draft carries a snapshot of the vacancy's role and offered compensation. It does not approve pay, change payroll, mark forms complete, or overwrite an existing onboarding agreement. Candidate Onboarding/Hired stages derive from the actual linked setup and clearance, rather than a selectable completion checkbox.

The Onboarding view shows pending employee setup. Completed setup and filled/closed jobs remain in Completed & Closed with history. A completed employee does not remain in the pending queue. Existing workers can finish missing records without being labeled job applicants. The dashboard's onboarding count opens this queue. Returning from a personnel file preserves the vacancy/hiring view, and Refresh reloads both personnel and hiring data.

Vacancies and candidate contacts are encrypted HR records. Hiring access follows assigned Admin responsibilities and employee/department scope, not job-title text. Server validation prevents forced Hired stages, conflicting links, reassignment of an already-linked applicant, and starting a withdrawn/declined candidate or closed/filled opening. The UI uses the same controls as the protected endpoint. No live hiring or personnel data was created during validation; visual checks used synthetic fixtures.

A shared filter-count bug discovered during this work counted dropdown option values as active filters. The counter now counts only the selected filter value, so the untouched hiring search has no false filter badge.

## Preferred identity, contact email, and second emergency contact

Employees do not need company mailboxes. The assigned sign-in accepts a personal or company address; Work Email is optional and may be assigned later. Personal Email is a separate encrypted contact field. Use Sign-In Email explicitly copies the assigned address into the contact field, avoiding repeat typing without silently changing authentication or mailbox aliases. The employee profile correctly labels the assigned address Sign-In Email instead of assuming it is personal.

Personal Details now includes Preferred Display Name, optional pronouns (presets or custom), self-reported gender including Nonbinary, and an optional description for Self-Describe. The preferred name is entered exactly as it should appear, for example Alex Englert, while the full/legal name remains separately stored for personnel administration and official documents. Profile headers, directories, org-chart labels, staff selection lists, session identity, and current cross-module staff projections use the preferred display name when supplied. Clearing it falls back to the full name. Existing audit snapshots and completed documents are not rewritten. Gender remains subject to HR demographic visibility; shared staff lists omit it and legal names.

Authorized personnel and employees can add both primary and secondary emergency contacts with name, relationship, and phone. Empty optional fields are omitted from the profile display. Personal email, emergency contacts, birthday, address, identity documents, allergy details, and self-described gender text remain in encrypted private HR storage. Pronouns and the display name are available on ordinary profile identity views as intentionally entered.

Personal-details saves also update the canonical profile preferences in one transaction, with record versions and audit entries for each record. Employees can change only the three permitted profile preferences through this form; legal-name, sign-in, role, pay, and access changes remain outside this self-service action. Seed personnel records are supported without a separate initialization action. Official document generation, payroll names, signature defaults, and bank-account name defaults use the full/legal name. Name edits made through shared staff dropdowns change the display name rather than overwriting the personnel full name.

Validation used synthetic personnel and test databases. No actual employee's identity, email, gender, pronouns, emergency contacts, banking information, or employment terms were changed as part of this software update.
