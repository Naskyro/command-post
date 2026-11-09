CREATE TABLE `relationship_portraits` (
	`contact_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`storage_key` text,
	`mime` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
