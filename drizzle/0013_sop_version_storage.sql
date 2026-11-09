CREATE TABLE `sop_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`success` integer NOT NULL,
	CONSTRAINT "sop_write_succeeded" CHECK("sop_guard"."success" = 1)
);
--> statement-breakpoint
CREATE TABLE `sop_versions` (
	`key` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sop_versions_policy` ON `sop_versions` (`policy_id`);--> statement-breakpoint
CREATE INDEX `sop_versions_status` ON `sop_versions` (`status`);