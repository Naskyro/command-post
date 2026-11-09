CREATE TABLE `hr_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hr_audit_record_idx` ON `hr_audit` (`record_id`);--> statement-breakpoint
CREATE TABLE `hr_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`person_id` text,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hr_records_person_idx` ON `hr_records` (`person_id`);--> statement-breakpoint
CREATE INDEX `hr_records_kind_idx` ON `hr_records` (`kind`);--> statement-breakpoint
CREATE TABLE `hr_write_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`success` integer NOT NULL,
	CONSTRAINT "hr_write_succeeded" CHECK("hr_write_guard"."success" = 1)
);
