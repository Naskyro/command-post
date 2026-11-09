CREATE TABLE IF NOT EXISTS `ccr_court_upload_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`expires_at` integer NOT NULL,
	`parts` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccr_stage_expiry` ON `ccr_court_upload_stages` (`expires_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccr_stage_actor` ON `ccr_court_upload_stages` (`actor`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ccr_damage_intake_sources` (
	`lookup` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ccr_damage_intake_versions` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ccr_document_upload_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`principal` text NOT NULL,
	`expires` integer NOT NULL,
	`parts` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccr_docstage_principal` ON `ccr_document_upload_stages` (`principal`,`expires`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ccr_docstage_expiry` ON `ccr_document_upload_stages` (`expires`);--> statement-breakpoint
CREATE TABLE `command_source_file_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`principal` text NOT NULL,
	`meta` text NOT NULL,
	`expires` integer NOT NULL,
	`cursor` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_stage_resume` ON `command_source_file_stages` (`principal`,`meta`);--> statement-breakpoint
CREATE INDEX `source_stage_expiry` ON `command_source_file_stages` (`expires`);--> statement-breakpoint
CREATE TABLE `command_source_file_versions` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`scope` text NOT NULL,
	`target_key` text NOT NULL,
	`payload` text NOT NULL,
	`filed_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
CREATE INDEX `source_file_destination` ON `command_source_file_versions` (`scope`,`target_key`);