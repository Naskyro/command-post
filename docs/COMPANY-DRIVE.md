# Company Drive — October 28, 2026

Replaces the Vehicle Disposition & Sales navigation and mock workspace. Existing Finance vehicle-sale records, commissions, and asset data are preserved. The old Home vehicle-sales widget is no longer offered.

## Folder structure and content
The seed in lib/drive/seed.ts reproduces eight major folders and visible nested folders from the four owner-provided screenshots. This imports names only, not documents. Filing Guide.txt was shown but its content was not provided, so no fabricated file is created. Root icons are category-specific vector icons. Users may create nested folders; managers may add root folders.

## Access
Admin > Users & Access exposes Company Drive > Shared Files and Manage All Folders & Sharing. The latter requires Edit to grant full drive administration. Owners retain full administration. Standard active users receive browse access by role default but no folder contents until shared. Custom-access users must have Company Drive assigned explicitly. Former/disabled/onboarding users cannot use Drive.

View Only means read/download. Edit includes read/download, upload, replace, text editing, folder creation, rename and recoverable removal. Edit does not grant resharing. Administrators may share any nested folder with individual active users. Children inherit by default. A direct user grant overrides inherited access; No Access is an explicit deny at that folder. Disabling inheritance isolates a folder while retaining explicit grants on it and descendants. A nested direct share never exposes its inaccessible ancestors or sibling contents; the accessible subtree appears at the recipient's drive landing. Administrators always retain all-folder access. Deleted ancestors hide descendants even with direct grants.

All listing, downloads, old file versions, uploads, and mutations re-check server authorization. UI hiding is not the access boundary. Browser file responses contain no storage keys. Attachments download as application/octet-stream with no-store, nosniff and sandbox headers. No public anonymous links are generated. Existing site audience is unchanged.

## Persistence and transactions
New schema-only migrations add drive_state (global optimistic revision) and drive_nodes (encrypted per-item metadata). Default folders are merged with persisted overrides; tombstones override defaults. Upload bytes are AES-GCM encrypted in R2 using the existing configured HR_DATA_ENCRYPTION_KEY, not stored in browser localStorage. Metadata uses the same encryption service. Key backups/rotation must cover both HR and Drive.

Mutations atomically guard the global revision, save the changed node and write a finance_audit event. Stale updates fail without overwriting newer data. Concurrent upload failure removes the newly uploaded unreferenced object. Failed object cleanup could require operations cleanup; historical R2 versions intentionally remain. Audit entries include actor, timestamp, before/after metadata and sharing changes, without file contents or storage keys. Downloads are logged. Existing Admin Activity & Change History exposes these under Finance with a Company Drive action prefix.

## Files and UX
Upload Files supports sequential multi-file selection, 20 MB maximum per file, progress/partial-success feedback, and duplicate-name rejection. A duplicate is not silently overwritten. Open a file and choose Upload New Version; prior versions remain downloadable. Replacement must retain the file extension. TXT/MD files under 200 KB can be edited in the module and saved as a new version. PDFs, Word, spreadsheets and other formats are downloaded, edited in their application, and uploaded as new versions. This release does not provide Office coauthoring or Google Docs-style concurrent editing. Uploads are not malware-scanned by this implementation; attachments are never executed or rendered as HTML by Drive.

Search within the folder filters its entries. The shell's Company Drive search finds authorized folder/file names. Breadcrumbs provide return navigation. Folder cards use distinct category icons; descendants use a compact table. Delete means Trash, requires a reason and only allows empty folders. Administrators can restore items; no permanent purge is exposed. Restore checks the original parent and sibling name collisions.

## Scale and verification
The catalog is currently loaded server-side and filtered before delivery. Each node has a 1 MB serialized metadata cap for very long version histories; large-scale search/pagination should be implemented before substantially expanding beyond a small-company library. File content limit is 20 MB per request, not an unrestricted video archive. Permissions are effective for future requests; previously downloaded files cannot be remotely revoked.

Validation: TypeScript check, dedicated inheritance/deny/subfolder/privacy/deleted-ancestor/name tests; synthetic browser QA for folder layout, breadcrumbs and permission dialog. No production documents or staff shares are created as test data.
