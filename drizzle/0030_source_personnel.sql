CREATE TABLE IF NOT EXISTS `ccr_reviewed_drive_links` (
	`source_key` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hr_source_people` (
	`folder_id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hr_source_target` ON `hr_source_people` (`target_id`);