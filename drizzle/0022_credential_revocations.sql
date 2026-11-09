CREATE TABLE `command_credential_revocations` (
	`person_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`service_version` integer NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	`service_required` integer NOT NULL
);
