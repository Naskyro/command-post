CREATE TABLE `job_description_assignments` (
	`person_id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_description_editions` (
	`description_id` text NOT NULL,
	`version` integer NOT NULL,
	`etag` integer NOT NULL,
	`status` text NOT NULL,
	`department_id` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`description_id`, `version`)
);
--> statement-breakpoint
CREATE INDEX `job_description_department` ON `job_description_editions` (`department_id`);--> statement-breakpoint
CREATE TABLE `user_sample_dismissals` (
	`person_id` text NOT NULL,
	`module` text NOT NULL,
	`sample_id` text NOT NULL,
	`dismissed_at` text NOT NULL,
	PRIMARY KEY(`person_id`, `module`, `sample_id`)
);
