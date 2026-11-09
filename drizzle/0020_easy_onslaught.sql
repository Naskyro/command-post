CREATE TABLE `school_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor` text NOT NULL,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`before` text,
	`after` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `school_audit_record` ON `school_audit` (`record_id`);--> statement-breakpoint
CREATE TABLE `school_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`success` integer NOT NULL,
	CONSTRAINT "school_write_succeeded" CHECK("school_guard"."success"=1)
);
--> statement-breakpoint
CREATE TABLE `school_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`person_id` text,
	`course_id` text,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `school_person` ON `school_records` (`person_id`);--> statement-breakpoint
CREATE INDEX `school_course` ON `school_records` (`course_id`);--> statement-breakpoint
CREATE INDEX `school_kind` ON `school_records` (`kind`);