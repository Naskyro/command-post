CREATE TABLE IF NOT EXISTS `ccr_register_versions` (
	`record_id` text NOT NULL,
	`section` text NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`record_id`, `version`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccr_register_section_id_version` ON `ccr_register_versions` (`section`,`record_id`,`version`);