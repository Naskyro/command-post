CREATE TABLE `ccr_court_directory` (
	`version` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`changed_at` text NOT NULL,
	`action` text NOT NULL,
	`entry_id` text NOT NULL,
	`reason` text NOT NULL
);
