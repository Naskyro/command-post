CREATE TABLE `finance_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`at` text NOT NULL,
	`reason` text NOT NULL,
	`before` text,
	`after` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finance_audit_record_idx` ON `finance_audit` (`record_id`);--> statement-breakpoint
CREATE TABLE `finance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
