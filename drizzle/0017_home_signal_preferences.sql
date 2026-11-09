CREATE TABLE `home_signal_preferences` (
	`person_id` text PRIMARY KEY NOT NULL,
	`preferences` text NOT NULL,
	`version` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
