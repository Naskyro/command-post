CREATE TABLE `ccr_case_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`responsibility_finding` text,
	`recoverable_amount` real,
	`recovery_approved_amount` real,
	`collection_method` text,
	`reason` text,
	`decision_made_by` text NOT NULL,
	`decision_date` text NOT NULL,
	`status` text DEFAULT 'Approved' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ccr_case_decisions_incident_id_unique` ON `ccr_case_decisions` (`incident_id`);--> statement-breakpoint
CREATE INDEX `ccr_case_decisions_incident_idx` ON `ccr_case_decisions` (`incident_id`);--> statement-breakpoint
CREATE TABLE `ccr_employee_recovery` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`case_decision_id` text NOT NULL,
	`approved_total` real NOT NULL,
	`collected_total` real DEFAULT 0 NOT NULL,
	`remaining_balance` real NOT NULL,
	`posted_deductions` real DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ccr_employee_recovery_employee_idx` ON `ccr_employee_recovery` (`employee_id`);--> statement-breakpoint
CREATE INDEX `ccr_employee_recovery_incident_idx` ON `ccr_employee_recovery` (`incident_id`);--> statement-breakpoint
CREATE TABLE `ccr_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`file_id` text NOT NULL,
	`sha256_hash` text NOT NULL,
	`file_type` text,
	`file_size` integer,
	`original_filename` text,
	`uploader_id` text NOT NULL,
	`upload_time` text NOT NULL,
	`claimed_source` text,
	`content_classification` text DEFAULT 'public' NOT NULL,
	`caption` text,
	`created_at` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ccr_evidence_incident_idx` ON `ccr_evidence` (`incident_id`);--> statement-breakpoint
CREATE TABLE `ccr_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`location` text,
	`brief_description` text,
	`immediate_safety_concern` integer DEFAULT 0 NOT NULL,
	`property_id` text,
	`employee_id` text,
	`occurrence_date` text,
	`occurrence_unknown` integer DEFAULT 0 NOT NULL,
	`reporter_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	`internal_stage` text DEFAULT 'Draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`assigned_to` text,
	`priority` text DEFAULT 'Normal',
	`recovery_status` text
);
--> statement-breakpoint
CREATE INDEX `ccr_incidents_employee_idx` ON `ccr_incidents` (`employee_id`);--> statement-breakpoint
CREATE INDEX `ccr_incidents_stage_idx` ON `ccr_incidents` (`internal_stage`);--> statement-breakpoint
CREATE INDEX `ccr_incidents_reporter_idx` ON `ccr_incidents` (`reporter_id`);--> statement-breakpoint
CREATE TABLE `ccr_insurance_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`provider` text,
	`claim_number` text,
	`status` text DEFAULT 'Open',
	`amount_claimed` real,
	`amount_paid` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ccr_insurance_claims_incident_idx` ON `ccr_insurance_claims` (`incident_id`);--> statement-breakpoint
CREATE TABLE `ccr_regulatory_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`agency` text,
	`finding` text,
	`status` text DEFAULT 'Open',
	`due_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ccr_regulatory_findings_incident_idx` ON `ccr_regulatory_findings` (`incident_id`);