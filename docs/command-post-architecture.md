# Command Post: access, payroll settings, and daily work

Updated September 5, 2026. This implementation extends the existing private Command Post Site and retains its database and files.

## Structure

| Workspace | Owns | Main implementation |
| --- | --- | --- |
| Admin | System role, module/tab grants, enabled account, Department Head assignments | `components/finance/UserAccessWorkspace.tsx`, `components/people/DepartmentSettings.tsx` |
| People & HR | Employee profile, reporting line, onboarding, initial bounded permissions; restricted pay agreements | `components/people/PeopleDirectory.tsx`, `components/people/PersonEditor.tsx` |
| Finance | Pay agreements, payroll calendar, categories, budgets, bank categorization, debt plans, bookkeeping | `components/finance/FinanceWorkspace.tsx` |
| Timeclock | Clock events, timesheets, requests, leave, hourly schedule | `components/finance/TimeclockWorkspace.tsx`, `ShiftCalendar.tsx` |
| Home | Current user's available workspaces, own shifts/hours/PTO, accessible requests and payroll forecast | `components/home/HomeWorkspace.tsx`, `app/api/home/route.ts` |

## Authorization and data boundaries

`lib/people/policy.ts` defines separate profile, access, pay, and Timeclock projections. Admin responses never include salary amounts, pay arrangements, private pay notes, or confidential pay attachments. Audit responses apply the same projection and omit pay-only changes from Admin history. The previous salary constants were removed from the legacy client roster.

`lib/finance/access.ts` defines module/tab View and Edit grants. Department Head is a permission role; Director of Operations and the other supplied titles are job titles. The three named owner accounts retain full access. Payroll release requires both Finance Payroll edit access and an owner identity or the assigned Operations Department Head.

`app/api/people/route.ts` accepts distinct actions for profile, onboarding, access, pay, and department changes. It validates field allowlists, company email aliases, reporting loops, role ceilings, and module/tab grant ceilings. Nonowners can create or change access only within their reporting branch and cannot raise their own permissions. New hires remain disabled until onboarding completes. Subsequent access changes use Admin. A user cannot gain payroll release authority merely by granting the Payroll tab.

`lib/finance/visibility.ts` scopes record lists and payrun lines, hides unreleased employee tax documents, and removes payroll amounts from Timeclock. Person attachments require pay-record access. Payroll and HR UI pages do not share an Admin form.

## Editable finance records

`lib/finance/quick-edit.ts` supplies a small allowlist of inline changes: established transaction categories, debt monthly payments, category budget mode and amount, category group, bill/invoice/debt/tax due dates, renewal amount and frequency, and vendor terms/W-9 status. Finalized records retain their locks. Sensitive payment and filing transitions continue through their dedicated actions.

`components/finance/InlineCell.tsx` uses dropdowns for choices and explicit save/cancel or Enter/Escape for numbers and dates. Failed requests retain the value being edited. Updates use the same server validation, optimistic version check, and audit write as the full editor.

Categories remain linked to identically named bookkeeping accounts. A category can have no budget or a monthly budget, including an explicit zero budget. Monthly overrides and YTD growth-based suggestions remain available separately.

`ExpenseChart.tsx` shows a pie chart by category, group, department, or person for the selected transaction dates. The default expense view excludes transfers and unreviewed withdrawals; All money out is available separately. Withdrawals remain flagged until responsible person, category, purpose, cash destination, and completed review are recorded. A category change alone does not confirm cash custody or spending. Cash bags and grouped deposit matching remain available for pooled release cash.

## Payroll calendar and scheduling

`lib/finance/payroll-calendar.ts` stores dated workweek/payday policies. The original Sunday–Saturday calendar remains in historical periods. Future changes require an owner, an effective date matching the new first weekday, and a reason. Changes cannot affect approved or released payroll. A bridge period is explicit and needs reviewed wages/overtime before release; it is not silently paid as a full salary week.

`lib/finance/calendar.ts` clips overnight shifts into their actual portions on each day and lays simultaneous shifts into separate lanes. The calendar shows a fixed time axis and positioned shifts. Clock duration remains calculated in Central time, including daylight-saving transitions. Department Heads and supervisors operate within their assigned scope; coverage and schedule publication remain validated.

## Persistence, failures, and validation

The existing D1 records and audit tables remain in place. Each mutation records user identity, time, before/after values, reason, and version. Optimistic writes prevent overwriting a newer record. Existing transactional payroll/payment protections are retained. No live payroll, payment, or employee changes were made for testing this update.

`lib/shared/client.ts` bounds request time and preserves actionable network errors. `lib/shared/errors.ts` rejects malformed, oversized, or cross-site JSON; returns safe storage errors with a request ID; and emits structured server logs without salary or bank payloads.

## Verification and current limits

The automated finance suite covers identity aliases, authorization ceilings, sensitive-data projections, audit privacy, payroll calculations, transition periods, overnight/DST behavior, open-shift rules, assets, bill approvals, category budgets, cash reviews, and quick edits. TypeScript and the production build are also required before publication.

Bank transfer execution, bank synchronization, automatic payroll tax calculation, tax filing, and Slack API synchronization are not connected by this change. Existing manual tax verification and payment recording remain explicit. Some older account, work-order, compliance, and HR specialty screens still use session-based prototype workflows; this update does not represent a completed replacement for those backend integrations. Browser interaction was not part of this verification pass.
