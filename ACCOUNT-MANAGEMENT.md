# Account Management

## Structure

- `lib/accounts/model.ts`: shared record schemas, dated relationships, contact/signage deadlines and courtesy policy counters.
- `lib/accounts/policy.ts`: module grants, assignment scope, field validation and protected document access.
- `lib/accounts/releases.ts`: courtesy review, policy limits, historical manager snapshots and physical-release gates.
- `lib/accounts/server.ts`: canonical D1 records, atomic version checks, audit history and cross-module actions.
- `lib/accounts/google.ts`: Google OAuth, encrypted refresh tokens, MIME attachments and bounded Gmail requests.
- `app/api/accounts`: authenticated shared record, file and Google endpoints.
- `components/accounts`: compact account profiles, relationship directory, work queue, signage history, internal courtesy tracker, onboarding, files and property results.
- `drizzle/0005_perfect_blue_marvel.sql`: additive account tables and indexes. Existing Finance data is retained.

Both Accounts and Account Management use the same IDs and database rows. The dispatch response excludes department financial records and private relationship notes. Client grants control available actions; server grants and assignment checks enforce them. Changes use optimistic versions with an atomic write guard and audit row. Courtesy approvals also update the account version, serializing concurrent decisions against the same allowance history.

Contacts are independent of properties. Affiliations connect a person to a property or company with role and effective dates. Management company, apartment owner and regional manager are separate relationships. A release snapshots its historical manager and tenure; a later contact move cannot silently reattribute that release.

The assigned Account Manager and the Account Managers Department Head own service and courtesy decisions within their grants. Routine decisions have no owner approval dependency. Dispatch can record requests and complete approved releases, but cannot authorize them.

## Imported evidence

The initial import contains 94 historical courtesy entries from 29 Google Docs and 271 signage photos from 45 Drive folders. The source policy, guide and requested property PDFs are accessible through authenticated file routes. Original full-resolution photos remain in Drive; protected previews are embedded in the server build. Airport Valero remains unmatched and can be assigned from Department.

Missing original charges, VINs, manager tenure and waived amounts remain unknown. The original tracker wording and source URL are retained. Historical reductions described as a final price are imported as final charges, without inventing original charges or a discount value. Source names are retained as search aliases. Ambiguous account names remain separate until verified.

Photo dates use available source metadata/date stamps. Upload dates do not reset inspection deadlines. Undated source photo sets require confirmation. Photos document a past signage check; their condition is imported as Unknown. Future inspections record condition, locations, trigger and the responsible staff member.

`scripts/account-imports` contains the reviewed source inventories and repeatable import logic. Rebuilding original photo previews requires the original Drive downloads and supplied PDFs in the scratch import paths specified by that script. Operational edits live in D1 and override the seed, so reopening a module does not overwrite staff changes.

## Google Workspace setup

The Google mail implementation is complete, but the current Site has no Google OAuth configuration. Set these runtime values before connecting mailboxes:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`: `https://command-post-accounts.jersonarauz.chatgpt.site/api/accounts/google/callback`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: a securely generated secret of at least 32 characters; preserve it to decrypt existing connections.

Enable Gmail API in the organization's Google Cloud project, register the exact callback URL, and configure internal Workspace OAuth access for `openid`, `email`, `gmail.readonly` and `gmail.send`. Each employee connects their own verified company mailbox. No mailbox credentials belong in source files.

Users explicitly link relevant conversations; only those messages and attachments become department account history. Refresh retrieves new messages on linked threads. Composing and sending happen through the connected mailbox, with the attached PDFs sent as actual attachments. Internal release policy files cannot be attached to property emails. A send timeout is recorded as unconfirmed and checked against Gmail Sent before retrying; it is never automatically resent. Open tracking is not fabricated or claimed, and mailbox connection has not been tested against a configured production Google client.

## Verification and release

Run `node --test tests/accounts/workflows.test.mjs` for policy, permissions, historical imports, shared persistence, stale-update rollback, manager moves and idempotent Finance mileage submission. Run the existing Finance tests after changes to shared grants. Use the Sites build helper for the production Worker build.

The migration adds tables without deleting old records. Preview/source changes do not alter the deployed Site until a saved version is published. No production email, physical release, or external message is sent by these tests.
