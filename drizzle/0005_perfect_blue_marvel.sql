CREATE TABLE `account_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`account_id` text,
	`actor` text NOT NULL,
	`actor_id` text NOT NULL,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_audit_record_idx` ON `account_audit` (`record_id`);--> statement-breakpoint
CREATE INDEX `account_audit_account_idx` ON `account_audit` (`account_id`);--> statement-breakpoint
CREATE TABLE `account_google` (
	`person_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account_oauth` (
	`state` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`account_id` text,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_records_kind_idx` ON `account_records` (`kind`);--> statement-breakpoint
CREATE INDEX `account_records_account_idx` ON `account_records` (`account_id`);--> statement-breakpoint
CREATE TABLE `account_write_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`success` integer NOT NULL,
	CONSTRAINT "account_write_succeeded" CHECK("account_write_guard"."success" = 1)
);
