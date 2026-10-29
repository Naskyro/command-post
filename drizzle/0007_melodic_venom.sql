CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_version` integer,
	`actor_id` text NOT NULL,
	`actor_role_at_time` text NOT NULL,
	`operation` text NOT NULL,
	`field_name` text,
	`old_value` text,
	`new_value` text,
	`outcome` text NOT NULL,
	`denial_reason` text,
	`request_id` text,
	`action_time` text NOT NULL,
	`created_at` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_log_time_idx` ON `audit_log` (`created_at`);