CREATE TABLE `hr_confidential_concerns` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text
);
