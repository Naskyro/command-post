CREATE TABLE `report_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`area` text NOT NULL,
	`name` text NOT NULL,
	`report_id` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `report_presets_owner_area` ON `report_presets` (`person_id`,`area`);