# Finance implementation — September 5, 2026

Existing Command Post site identity retained. Finance is the landing module for review.

Finance uses authenticated server routes, D1 record overrides and audit history, and R2 attachments. Immutable imported sources remain server-side. Original bank amounts/dates/descriptions cannot be overwritten through categorization. Corrections to drafts include an actor, actual timestamp, before/after values, and reason. Paid, filed, closed, released, and posted records are locked.

Imported source: Business Accounting.xlsx includes 5,547 numeric transaction rows, 60 categories, 15 account snapshots, and 12 debt records. Two nonnumeric amounts (Transactions rows 4687 and 5079) remain explicit import issues and are excluded from totals. Austin's January–March debit-card log includes 89 purchases. Master payroll instructions seed current compensation, former workers, and Braden's historical $622.40 Silverado balance; no later payment was inferred. The Chase snapshot is $5,082.72 dated September 4, 2026, not a live balance.

Seven Finance sections: Overview, Payroll, Outflows, Receivables, Debts, Reports & Taxes, Settings. Main workflows include payroll review, time entry/clock punches, regular-rate overtime, taxable noncash earnings, deductions, reimbursements, manual tax input, frozen released runs, external payment recording, paystub PDF, Excel/PDF record exports, weekly spending reports, category splits, cash bags, grouped deposit matching, balanced bookkeeping entries, debt plans, assets, vendor/bill/renewal records, owner money, past tax-year review, document release, and monthly close. Database constraints prevent duplicate person/week releases and negative unpaid payroll balances.

Only the owner's confirmed authenticated account is initially mapped. Future users need their verified platform user ID assigned to a person; role assignments determine permissions. Owners and the assigned Operations Director may release payroll. Site audience remains its existing private owner audience. Broader employee sharing is not performed in this change.

Important remaining production work:
- Payroll tax calculations are verified manual inputs, not an implemented federal/state tax engine. Austin's net agreement blocks approval until entered gross and verified taxes produce $1,500. Validate actual elections, YTD, classifications, tax deposits, and payroll acceptance before replacing the current payroll process.
- No money is transmitted. Release is approval for payment; external payment records require references. Chase/Plaid/payment-provider credentials, entitlement, instant recipient eligibility, and live integrations are not configured.
- Slack replaces the custom messaging view; workspace link is editable, actual Slack API messages/notifications await connection. No external Slack messages are sent.
- Accounting imports are source evidence, not auto-posted complete double-entry books. Opening balances, account mappings, journals, statement reconciliation, and source corrections require review. Reports based on posted journals are distinct from imported bank cash activity.
- Tax filing history/elections/deadlines remain unconfirmed. Year-end exports are recorded payroll data or attached reviewed documents, not transmitted tax returns. Delivery permissions do not waive statutory deadlines.
- Current commissions can be entered with source IDs; full automated Towbook eligibility, assignment history, tariff proration, and API synchronization remain integration work.
- Existing non-Finance modules retain prior prototype data behavior. Generic introduction/compliance banners were removed; their detailed workflows remain accessible.

Verification: TypeScript passes; lint has no errors (remaining legacy unused-code warnings). Eight independent payroll arithmetic/period tests pass, including the supplied Braden hourly example and net-salary target. SQLite migrations and constraints tested for duplicate release and overpayment rejection. Production Sites build passes. No browser QA was requested or run.
