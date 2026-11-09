import {sqliteTable,text,integer,index,uniqueIndex,check,primaryKey} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const financeRecords=sqliteTable('finance_records',{id:text('id').primaryKey(),kind:text('kind').notNull(),payload:text('payload').notNull(),version:integer('version').notNull(),updatedBy:text('updated_by').notNull(),updatedAt:text('updated_at').notNull()});
export const financeAudit=sqliteTable('finance_audit',{id:text('id').primaryKey(),recordId:text('record_id').notNull(),actor:text('actor').notNull(),actorId:text('actor_id').notNull(),at:text('at').notNull(),reason:text('reason').notNull(),before:text('before'),after:text('after').notNull()},t=>[index('finance_audit_record_idx').on(t.recordId)]);
export const payrollClaims=sqliteTable('finance_payroll_claims',{id:text('id').primaryKey(),run:text('run').notNull()});
export const payrollBalances=sqliteTable('finance_payroll_balances',{id:text('id').primaryKey(),remaining:integer('remaining').notNull()},t=>[check('payroll_balance_nonnegative',sql`${t.remaining} >= 0`)]);
export const homeLayouts=sqliteTable('home_layouts',{personId:text('person_id').primaryKey(),widgets:text('widgets').notNull(),grid:text('grid').notNull().default('{"columns":3,"spacing":"Comfortable"}'),version:integer('version').notNull(),updatedBy:text('updated_by').notNull(),updatedAt:text('updated_at').notNull()});
export const userSampleDismissals=sqliteTable('user_sample_dismissals',{personId:text('person_id').notNull(),module:text('module').notNull(),sampleId:text('sample_id').notNull(),dismissedAt:text('dismissed_at').notNull()},t=>[primaryKey({columns:[t.personId,t.module,t.sampleId]})]);
export const userSettings=sqliteTable('user_settings',{personId:text('person_id').primaryKey(),theme:text('theme').notNull().default('command-post'),version:integer('version').notNull(),updatedBy:text('updated_by').notNull(),updatedAt:text('updated_at').notNull()});

export const accountRecords=sqliteTable('account_records',{id:text('id').primaryKey(),kind:text('kind').notNull(),accountId:text('account_id'),payload:text('payload').notNull(),version:integer('version').notNull(),updatedAt:text('updated_at').notNull()},t=>[index('account_records_kind_idx').on(t.kind),index('account_records_account_idx').on(t.accountId)]);
export const accountAudit=sqliteTable('account_audit',{id:text('id').primaryKey(),recordId:text('record_id').notNull(),accountId:text('account_id'),actor:text('actor').notNull(),actorId:text('actor_id').notNull(),at:text('at').notNull(),action:text('action').notNull(),before:text('before'),after:text('after').notNull()},t=>[index('account_audit_record_idx').on(t.recordId),index('account_audit_account_idx').on(t.accountId)]);
export const accountWriteGuard=sqliteTable('account_write_guard',{id:text('id').primaryKey(),success:integer('success').notNull()},t=>[check('account_write_succeeded',sql`${t.success} = 1`)]);
export const accountGoogle=sqliteTable('account_google',{personId:text('person_id').primaryKey(),email:text('email').notNull(),encryptedToken:text('encrypted_token').notNull(),updatedAt:text('updated_at').notNull()});
export const accountOAuth=sqliteTable('account_oauth',{state:text('state').primaryKey(),personId:text('person_id').notNull(),expiresAt:integer('expires_at').notNull()});

export const hrRecords=sqliteTable('hr_records',{id:text('id').primaryKey(),kind:text('kind').notNull(),personId:text('person_id'),payload:text('payload').notNull(),version:integer('version').notNull(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull(),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull()},t=>[index('hr_records_person_idx').on(t.personId),index('hr_records_kind_idx').on(t.kind)]);
export const hrAudit=sqliteTable('hr_audit',{id:text('id').primaryKey(),recordId:text('record_id').notNull(),actor:text('actor').notNull(),actorId:text('actor_id').notNull(),at:text('at').notNull(),action:text('action').notNull(),version:integer('version').notNull(),snapshot:text('snapshot').notNull()},t=>[index('hr_audit_record_idx').on(t.recordId)]);
export const hrWriteGuard=sqliteTable('hr_write_guard',{id:text('id').primaryKey(),success:integer('success').notNull()},t=>[check('hr_write_succeeded',sql`${t.success} = 1`)]);

export const driveState=sqliteTable('drive_state',{id:text('id').primaryKey(),payload:text('payload').notNull(),version:integer('version').notNull()});
export const driveNodes=sqliteTable('drive_nodes',{id:text('id').primaryKey(),payload:text('payload').notNull()});

export const hrConcerns=sqliteTable('hr_confidential_concerns',{id:text('id').primaryKey(),payload:text('payload').notNull(),submittedAt:text('submitted_at').notNull(),reviewedAt:text('reviewed_at'),reviewedBy:text('reviewed_by')});
export const dismissedConcernExamples=sqliteTable('hr_dismissed_concern_examples',{key:text('key').primaryKey()});
export const hrPracticeReplies=sqliteTable('hr_practice_replies',{id:integer('id').primaryKey({autoIncrement:true}),mailbox:text('mailbox').notNull(),payload:text('payload').notNull()},t=>[index('hr_practice_mailbox').on(t.mailbox)]);

export const sopEntries=sqliteTable('sop_entries',{id:text('id').primaryKey(),etag:integer('etag').notNull(),history:text('history').notNull()});
export const sopTopics=sqliteTable('sop_topics',{id:text('id').primaryKey(),prefix:text('prefix').notNull().unique(),name:text('name').notNull(),archived:integer('archived').notNull().default(0),etag:integer('etag').notNull()});
export const sopCounters=sqliteTable('sop_counters',{prefix:text('prefix').primaryKey(),lastNumber:integer('last_number').notNull()});
export const sopRequests=sqliteTable('sop_requests',{id:text('id').primaryKey(),payload:text('payload').notNull()});
export const sopAcks=sqliteTable('sop_acks',{id:text('id').primaryKey(),person:text('person').notNull(),policyId:text('policy_id').notNull(),version:integer('version').notNull(),at:text('at').notNull()},t=>[index('sop_ack_person').on(t.person)]);
export const sopVersions=sqliteTable('sop_versions',{key:text('key').primaryKey(),policyId:text('policy_id').notNull(),status:text('status').notNull(),payload:text('payload').notNull()},t=>[index('sop_versions_policy').on(t.policyId),index('sop_versions_status').on(t.status)]);
export const sopGuard=sqliteTable('sop_guard',{id:text('id').primaryKey(),success:integer('success').notNull()},t=>[check('sop_write_succeeded',sql`${t.success} = 1`)]);
export const sopSignatures=sqliteTable('sop_signatures',{id:text('id').primaryKey(),personId:text('person_id').notNull(),policyKey:text('policy_key').notNull(),signedAt:text('signed_at').notNull(),receipt:text('receipt').notNull()},t=>[index('sop_signature_person').on(t.personId),index('sop_signature_policy').on(t.policyKey)]);

export const jobDescriptionEditions=sqliteTable('job_description_editions',{descriptionId:text('description_id').notNull(),version:integer('version').notNull(),etag:integer('etag').notNull(),status:text('status').notNull(),departmentId:text('department_id').notNull(),payload:text('payload').notNull()},t=>[primaryKey({columns:[t.descriptionId,t.version]}),index('job_description_department').on(t.departmentId)]);
export const jobDescriptionAssignments=sqliteTable('job_description_assignments',{personId:text('person_id').primaryKey(),documentId:text('document_id').notNull()});
export const sopPolicyOpens=sqliteTable('sop_policy_opens',{personId:text('person_id').notNull(),policyKey:text('policy_key').notNull(),openedAt:text('opened_at').notNull()},t=>[primaryKey({columns:[t.personId,t.policyKey]})]);
export const homeSignalPreferences=sqliteTable('home_signal_preferences',{personId:text('person_id').primaryKey(),preferences:text('preferences').notNull(),version:integer('version').notNull(),updatedBy:text('updated_by').notNull(),updatedAt:text('updated_at').notNull()});

// Append-only encrypted court docket. Each revision retains its author and event time in the envelope.
export const courtDocketVersions=sqliteTable('ccr_docket_versions',{matterId:text('matter_id').notNull(),version:integer('version').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()},t=>[primaryKey({columns:[t.matterId,t.version]})]);

export const reportPresets=sqliteTable('report_presets',{id:text('id').primaryKey(),personId:text('person_id').notNull(),area:text('area').notNull(),name:text('name').notNull(),reportId:text('report_id').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()},t=>[index('report_presets_owner_area').on(t.personId,t.area)]);

// School House: versioned learning records and append-only audit evidence.
export const schoolRecords=sqliteTable('school_records',{id:text('id').primaryKey(),kind:text('kind').notNull(),personId:text('person_id'),courseId:text('course_id'),version:integer('version').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()},t=>[index('school_person').on(t.personId),index('school_course').on(t.courseId),index('school_kind').on(t.kind)]);
export const schoolAudit=sqliteTable('school_audit',{id:text('id').primaryKey(),recordId:text('record_id').notNull(),actorId:text('actor_id').notNull(),actor:text('actor').notNull(),at:text('at').notNull(),action:text('action').notNull(),reason:text('reason').notNull(),before:text('before'),after:text('after').notNull()},t=>[index('school_audit_record').on(t.recordId)]);
export const schoolGuard=sqliteTable('school_guard',{id:text('id').primaryKey(),success:integer('success').notNull()},t=>[check('school_write_succeeded',sql`${t.success}=1`)]);

// Keep delegated sessions outside generic people/finance CRUD. No raw session token is stored.
export const delegatedSessions=sqliteTable('delegated_sessions',{
 tokenHash:text('token_hash').primaryKey(),id:text('id').notNull(),actorPerson:text('actor_person').notNull(),actorKey:text('actor_key').notNull(),actorName:text('actor_name').notNull(),
 subjectPerson:text('subject_person').notNull(),subjectName:text('subject_name').notNull(),reason:text('reason').notNull(),
 startedAt:text('started_at').notNull(),expiresAt:text('expires_at').notNull(),endedAt:text('ended_at'),endReason:text('end_reason')
},t=>[index('delegated_session_expiry').on(t.expiresAt),index('delegated_session_actor').on(t.actorPerson)]);

// Durable, non-secret revocation delivery. HR separation and Admin deactivation
// insert this command in the same D1 transaction as the local access block.
export const credentialRevocations=sqliteTable('command_credential_revocations',{
 person:text('person_id').primaryKey(),operation:text('operation_id').notNull(),version:integer('service_version').notNull(),
 actor:text('actor_id').notNull(),createdAt:text('created_at').notNull(),confirmedAt:text('confirmed_at'),required:integer('service_required').notNull()
});

// Canonical contact portrait shared across lead and account relationship tenures. Null key is an explicit removal.
export const relationshipPortraits=sqliteTable('relationship_portraits',{contactId:text('contact_id').primaryKey(),version:integer('version').notNull(),storageKey:text('storage_key'),mime:text('mime'),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull()});

/** Practice CRM never writes to account_records or any operational report feed. */
export const salesPractice=sqliteTable('sales_practice',{personId:text('person_id').primaryKey(),payload:text('payload').notNull(),version:integer('version').notNull()});

// CCR register mutations and attachment additions create separate, encrypted revisions.
// Keep this table separate from the property registry, court docket and HR records.
export const ccrRegisterVersions=sqliteTable('ccr_register_versions',{recordId:text('record_id').notNull(),section:text('section').notNull(),version:integer('version').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()},t=>[primaryKey({columns:[t.recordId,t.version]}),index('ccr_register_section_id_version').on(t.section,t.recordId,t.version)]);

// Immutable private Drive accession records and actor-bound resumable transfers.
export const sourceFileVersions=sqliteTable('command_source_file_versions',{id:text('id').notNull(),version:integer('version').notNull(),scope:text('scope').notNull(),targetKey:text('target_key').notNull(),payload:text('payload').notNull(),filedAt:text('filed_at').notNull()},t=>[primaryKey({columns:[t.id,t.version]}),index('source_file_destination').on(t.scope,t.targetKey)]);
export const sourceFileStages=sqliteTable('command_source_file_stages',{id:text('id').primaryKey(),principal:text('principal').notNull(),meta:text('meta').notNull(),expires:integer('expires').notNull(),cursor:integer('cursor').notNull(),payload:text('payload').notNull()},t=>[uniqueIndex('source_stage_resume').on(t.principal,t.meta),index('source_stage_expiry').on(t.expires)]);
// Previously deployed CCR stores; their original schema-only SQL remains immutable.
export const ccrDamageIntakeVersions=sqliteTable('ccr_damage_intake_versions',{id:text('id').notNull(),version:integer('version').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()},t=>[primaryKey({columns:[t.id,t.version]})]);
export const ccrDamageIntakeSources=sqliteTable('ccr_damage_intake_sources',{lookup:text('lookup').primaryKey(),id:text('id').notNull()});
export const ccrCourtStages=sqliteTable('ccr_court_upload_stages',{id:text('id').primaryKey(),actor:text('actor').notNull(),expiresAt:integer('expires_at').notNull(),parts:integer('parts').notNull(),payload:text('payload').notNull()},t=>[index('ccr_stage_expiry').on(t.expiresAt),index('ccr_stage_actor').on(t.actor)]);
export const ccrDocumentStages=sqliteTable('ccr_document_upload_stages',{id:text('id').primaryKey(),principal:text('principal').notNull(),expires:integer('expires').notNull(),parts:integer('parts').notNull(),payload:text('payload').notNull()},t=>[index('ccr_docstage_principal').on(t.principal,t.expires),index('ccr_docstage_expiry').on(t.expires)]);

export const ccrReviewedDriveLinks=sqliteTable('ccr_reviewed_drive_links',{sourceKey:text('source_key').primaryKey(),targetId:text('target_id').notNull()});

export const hrSourcePeople=sqliteTable('hr_source_people',{folderId:text('folder_id').primaryKey(),targetId:text('target_id').notNull(),payload:text('payload').notNull()},t=>[index('hr_source_target').on(t.targetId)]);

// Court and judge menu edits create a new directory revision; case labels remain historical snapshots.
export const ccrCourtDirectory=sqliteTable('ccr_court_directory',{version:integer('version').primaryKey(),payload:text('payload').notNull(),actor:text('actor').notNull(),actorId:text('actor_id').notNull(),changedAt:text('changed_at').notNull(),action:text('action').notNull(),entryId:text('entry_id').notNull(),reason:text('reason').notNull()});

// Confidential counsel records and their non-shared PDFs have their own encrypted, append-only history.
export const ccrCourtCounselVersions=sqliteTable('ccr_court_counsel_versions',{matterId:text('matter_id').notNull(),version:integer('version').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()},t=>[primaryKey({columns:[t.matterId,t.version]})]);

// Source message text is isolated from the ordinary case list and its reports.
export const ccrDamageMail=sqliteTable('ccr_damage_mail',{messageKey:text('message_key').primaryKey(),caseId:text('case_id').notNull(),payload:text('payload').notNull(),fingerprint:text('fingerprint').notNull(),filedAt:text('filed_at').notNull()},t=>[index('ccr_damage_mail_case').on(t.caseId)]);

export const ccrDamageSourceInventory=sqliteTable('ccr_damage_source_inventory',{idxKey:text('idx_key').primaryKey(),caseId:text('case_id').notNull(),signature:text('signature').notNull(),payload:text('payload').notNull()},t=>[index('ccr_damage_source_inventory_case').on(t.caseId)]);

// Medical narratives and signed originals are separate from ordinary personnel and claim records.
export const hrAccidentMedicalVersions=sqliteTable('hr_accident_medical_versions',{id:text('id').notNull(),version:integer('version').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()},t=>[primaryKey({columns:[t.id,t.version]})]);
export const hrAccidentMedicalAccess=sqliteTable('hr_accident_medical_access',{id:text('id').primaryKey(),caseId:text('case_id').notNull(),actorId:text('actor_id').notNull(),at:text('at').notNull(),action:text('action').notNull()});
