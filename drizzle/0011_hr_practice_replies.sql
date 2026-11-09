CREATE TABLE `hr_practice_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mailbox` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hr_practice_mailbox` ON `hr_practice_replies` (`mailbox`);