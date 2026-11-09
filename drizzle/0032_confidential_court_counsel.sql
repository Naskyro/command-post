CREATE TABLE `ccr_court_counsel_versions` (
	`matter_id` text NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`matter_id`, `version`)
);
