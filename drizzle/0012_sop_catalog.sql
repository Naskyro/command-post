CREATE TABLE `sop_acks` (
	`id` text PRIMARY KEY NOT NULL,
	`person` text NOT NULL,
	`policy_id` text NOT NULL,
	`version` integer NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sop_ack_person` ON `sop_acks` (`person`);--> statement-breakpoint
CREATE TABLE `sop_counters` (
	`prefix` text PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sop_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`etag` integer NOT NULL,
	`history` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sop_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sop_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`prefix` text NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`etag` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sop_topics_prefix_unique` ON `sop_topics` (`prefix`);