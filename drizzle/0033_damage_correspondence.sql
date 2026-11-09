CREATE TABLE `ccr_damage_mail` (
	`message_key` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`payload` text NOT NULL,
	`fingerprint` text NOT NULL,
	`filed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ccr_damage_mail_case` ON `ccr_damage_mail` (`case_id`);