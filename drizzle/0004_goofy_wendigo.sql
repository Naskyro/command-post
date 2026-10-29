CREATE TABLE `user_settings` (
	`person_id` text PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'command-post' NOT NULL,
	`version` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
