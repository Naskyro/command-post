# Command — Sales and workspace update

## Start with the rep's visit

A rep can save a newly discovered property with no photo and keep working. During a later visit they can open the lead, attach a photo of the property and preview it before saving. Photos are optional at every stage, including Contract Pending and Won. The person in Relationships and the building on a lead are different subjects: a contact headshot follows the contact, while an exterior follows the property. Never match photos to a live record by a similar property or person name.

| Where | Expected behavior |
| --- | --- |
| Sales CRM → Pipeline | Board, List and Follow-Up Calendar operate on the same filtered open leads. Board and List group by Stage or Assignee with collapsible sections. Calendar shows recorded due dates and keeps undated leads under Unscheduled. Won and Lost remain separate destinations. View, grouping and folded sections are saved per viewer per browser. Training records are labeled and do not contribute to open business value. |
| Sales CRM → Lead | Authorized reps can add, preview, replace or remove a saved lead's exterior. List selections open the actual lead. Sample building photos are synthetic and matched to the four fixed example IDs; other leads without photos use a neutral fallback. JPEG, PNG and WebP are accepted. |
| Sales CRM → Relationships | Select a person to see their current property and role, decision authority, follow-up, former affiliations and activity. Edit rights are evaluated for the linked lead. Contact details can be distinct from the office details for that particular relationship. |
| Won → Account Management → Pending Accounts | Link the account to the source opportunity. Preserve the exterior, canonical contacts and their portraits, role tenures, and authorized manual activity. Conversion is transactional and repeat-safe. A sample win creates no company account. Contact portraits use a separate private file store and do not require copying image bytes between workspaces. |
| School House | Courses with no upload render a branded cover. An authorized course creator can choose a design/accent or upload a cover, preview it in the editor, and publish it with the course. Existing students see the saved cover on their course pages. |
| Admin → Delegated Access | Start a time-limited, audited, read-only preview within the authorized scope; return using the persistent banner. A preview is distinct from the employee signing in. Restricted information and changes are blocked server-side. |
| Admin → People & Access | Work email is optional and separate from the private sign-in identity. The standalone password setup/reset requires the credential service in the independent-server guide. Do not issue employee credentials inside a legacy hosted login provider. |
| Finance, CCR, Work Orders, Account Management → Archive & Year in Review | At Austin's calendar-year boundary, completed prior-year records with valid dates remain available historically; unfinished work stays actionable. Separate activity during the year from open work at its close. Filter/export the records the viewer can access. Missing dates are not silently substituted. This is an operational archive, not an accounting close. |
| Site Themes and photo framing | The catalogue distinguishes illustrated, elegant, photographic/nature, and color-only options. Seasonal decorations preserve proportions. Framing supports moving a profile image horizontally as well as vertically before saving. |

## Engineering navigation

- Sales workspaces: `components/sales/`, `lib/sales/`, `app/api/sales/`.
- Relationship portraits and account handoff: `components/relationships/`, `lib/relationships/`, `lib/sales/handoff-relationships.ts`, and `lib/accounts/server.ts`.
- Course covers: `components/school/CourseCover*.tsx`, `lib/school/covers.ts`, `app/api/school/cover/`.
- Annual reporting: `lib/year-history/`, `app/api/year-history/`, `components/reports/YearArchive.tsx`. See `docs/finance-year-history.md` for source dates, cash totals and exclusions.
- Identity: read `docs/developer/command-account-access.md` and `standalone/command-auth/README.md` completely before deploying the independent gateway. Do not expose the app upstream or the internal credential listener.
- Art sources and provenance accompany `public/sample-properties/`, `public/sample-portraits/` and the seasonal assets. Use example ids only; uploaded customer photos stay in the private object store.

## Before accepting an independently hosted implementation

1. Use a disposable sales rep and a real-shaped test lead. Save it without a photo; add a building photo, reload, replace it and confirm that a view-only user cannot edit it. Check one similar-named lead stays unchanged.
2. Add a distinct property-manager portrait. Change the manager's property and verify their former role and photo remain attached to the person. Mark the lead Won, check the pending account exterior, contact history and follow-up detail, then repeat the conversion request to test duplicate protection. Do not run this acceptance test against a real customer's lead.
3. Select a pipeline view, fold one section, open a property, reload and confirm the chosen view survives. Sign in as a different test rep using the same browser and verify independent preferences.
4. Test the year boundary with both completed and open work, a record lacking a close date, and a case reopened in January. Verify a user without Finance access cannot download Finance data.
5. Test the login gateway, reset, revocation and read-only delegation on private staging. No employee's email address or last name is evidence of authorization.
6. Apply the migration ledger against a backup in staging. For this release, incremental migrations include 0021 (delegated access), 0022 (credential revocation) and 0023 (relationship portraits). Preserve existing data, encryption material and private file storage. Test an actual upload and read-back before rolling out the independent server.
