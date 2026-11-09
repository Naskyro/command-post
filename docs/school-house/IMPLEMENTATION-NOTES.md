# School House and Admin Update

This update extends the existing Command application. It preserves the hosted site identity, its access audience, and the existing SOP records and PDF workflow.

## Navigation and Data Connections

- The visible module name is **School House**. The existing internal `SOP Library` access key remains stable so saved permissions, policy acknowledgments, and links remain compatible.
- School House contains learner courses, assignments, assessment history, certificates, department leaderboards, instructor tools, and the existing policy library/workshop/archive/request inbox.
- Home reads a scoped server projection of assignments, overdue learning, course progress, team completion, and assessments awaiting review. Its existing dashboard arrangement, visibility, pinning, and schedule controls apply to learning.
- Personnel **Training & Credentials** displays the same learning and externally recorded achievements. It does not maintain a second independent grade database.
- Admin permission templates are reusable starting points. Applying a template records an individual snapshot; subsequent individual additions do not change the shared template or other employees.
- School House changes appear in the existing Admin Activity audit feed. Actor identity, event time, before/after values, and required correction reasons are retained.

## Course Sources and Review

The Account Manager Field Guide is imported from the supplied 86-slide editable presentation. Eight modules preserve its readings, anecdotes, examples, exercises, and 160 assessment prompts. The source reading PDF and illustrations are access-controlled with the course.

Six VSF source documents are retained with source indexes and review notes in this directory. The Dispatch pathway progresses through three units. Source answer conflicts and explicitly outdated exam material remain in instructor-review drafts; they are not silently represented as verified current regulatory requirements. Some text answers require instructor grading. This material is company training and does not purport to issue a state license or accredited continuing-education credit.

Default passing grades and retry limits are editable course settings, not facts attributed to a source document. Published SOP quizzes use the policy versions available to the viewer. A later draft does not remove the current published quiz. Changed published policy content requires review of generated training.

## Learner and Instructor Workflows

1. An authorized instructor creates or imports a course, arranges reading/media/assessment lessons, selects the permitted audience, and configures passing scores, retries, dates, and prerequisites.
2. Assignments link employees to the same course, with optional deadlines. Required onboarding courses follow the employee's department and permitted policy access.
3. Learners resume their assigned courses, complete reading and actual media playback, submit exams, and see their own attempt history and instructor feedback.
4. Sequential lessons unlock only when prerequisites and release dates allow them. A submitted manually graded exam remains pending until reviewed.
5. Completion certificates use the PTE logo and embedded fonts. The learner can choose a certificate with or without the score; that option does not change the stored score.
6. Authorized instructors can correct grades, void attempts, or reset progress with a recorded reason. These actions recalculate completion and certificate eligibility.
7. External training, license renewal evidence, and CE activity can be entered with proof and manual points. Department leaderboards use selected screen names and retain historical entries.

## Administrative Announcements

Announcements are in-app company broadcasts, not an email or SMS service. Authorized Admin users create drafts, preview, publish or schedule, revise dates/content, and archive messages. Enabled active and onboarding users see active broadcasts across modules and acknowledge for themselves. The banner disappears after their acknowledgment or the announcement's expiration.

The receipt is tied to a message content revision. Editing substantive content creates a new revision requiring acknowledgment; changing only availability dates preserves prior acknowledgments. The management screen retains sent-message history and recipient acknowledgment detail. No sample message is automatically broadcast to real employees.

## Seasonal Workspace Themes

Permanent workspace themes remain available. Admin **Site Theme** controls seasonal designs, their availability windows, and archiving/restoration. Employees opt into available themes through their existing Workspace Theme setting. A seasonal selection retains the employee's previous eligible theme and returns to it when the seasonal design becomes unavailable. Availability is enforced by the server and refreshed in the open workspace; a page left open must not continue indefinitely with an expired selection.

Announcements and Site Theme use separate Admin permission keys. Access to one does not grant the other or expose the personnel directory.

## User Provisioning and Authentication Boundary

Admin user setup distinguishes genuinely new hires from existing workers. New hires enter restricted onboarding; existing workers retain their assigned modules while missing personnel records remain pending. Deactivating access and employment separation are distinct. Reactivation must not silently reverse an employment termination.

Command currently uses the hosted platform's ChatGPT-managed sign-in. It does not store user passwords and cannot truthfully reset a ChatGPT password. Admin provides sign-in guidance instead of a nonfunctional reset button. Creating an application user also does not expand the hosted site's audience: the site owner must separately include the employee in the host's allowed audience when appropriate. This update preserves the current audience and does not send invitations.

## Storage and Deployment

- Existing D1 `DB` and R2 `BUCKET` bindings are preserved.
- Migration `0020_easy_onslaught.sql` adds durable School House records and audit/concurrency support.
- Announcements, their receipts, permission templates, and theme settings reuse established durable application records and audit mechanisms.
- Source PDFs and answer keys are server-only. Source/media endpoints check the current user's course/personnel scope; learner payloads remove assessment keys.
- The PDF import dependency is pinned to `unpdf` 2.1.0. Document import is bounded by input size, page count, extracted text size, and decompressed Office-document size. Scanned PDFs require a text-bearing source; import does not pretend to perform OCR.
- Repository tests cover actual route/database workflows, unauthorized record-ID collisions, manager/reporting scope, answer-key redaction, scheduled learning, corrections, certificates, imports, and dynamic Home data.

## Verification Boundaries

The local preview does not receive a hosted user identity. No authentication bypass is added for visual testing. Type checks and API/database tests run locally; authenticated browser inspection uses the existing hosted account after publication. A sign-in recovery action, a user invitation, or a company announcement is not considered sent merely because a record or a button exists.

## Department Leadership and Staffing

The company operates 24/7. Department leadership is continuous accountability, not a Monday–Friday coverage shift. Department setup no longer asks for Coverage Days, Coverage Starts, or Coverage Ends. Managers are represented by employees' reporting relationships; actual staffing belongs in Timeclock.

The former Backup Reviewer field is now an optional Temporary Review Delegate with an explicit expiration date. This is temporary review scope within permissions already assigned in Admin, not a new department head, an org-chart move, or a general permission grant. Missing or invalid expiration dates cannot activate delegation. Stored historical department settings and audit records are retained.

Dispatch and Driver staffing checks remain continuous. Other departments do not receive fabricated nine-to-five staffing gaps; their staffing gaps depend on explicit required schedule slots. A 24/7 company does not imply every administrative role is staffed around the clock.

## Learning Reader Typography

Lessons render semantic headings, bold and italic emphasis, bulleted lists, numbered steps, quotations, responsibility definitions, and reference tables. A shared safe reading renderer also powers Course Studio's Write/Preview workflow and formatting toolbar; authored HTML is rendered as text, not executed.

Published SOP lessons derive visible section metadata only from the entitled policy edition and an exact original-text match. Account Manager and VSF readings carry source-grounded presentation sections. Original lesson bodies, assessment data, and completion fingerprints are unchanged, so this presentation update does not reset progress. Instructor edits invalidate stale source formatting rather than displaying an older version over the new text. Original PDF templates are unchanged.

## Bulk SOP Acknowledgment

Auto Sign All accepts an explicit employee attestation that the current listed policy versions were already reviewed, including copies reviewed outside Command. Employees no longer have to reopen every document in the application. The dialog always presents the version list, optional document links, typed electronic signature, and affirmative review/acknowledgment consent. No signature is prechecked or submitted automatically.

The server validates the authenticated signer, assigned audience, edition, current pending versions, and consent atomically. Each receipt records the policy/content version, time, signer, and self-attested review method. An actual in-app open timestamp is included only when it exists; this workflow never creates a fictitious viewing event. The same shared workflow applies to HR onboarding.
