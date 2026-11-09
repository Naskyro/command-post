CREATE TABLE `sop_signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`policy_key` text NOT NULL,
	`signed_at` text NOT NULL,
	`receipt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sop_signature_person` ON `sop_signatures` (`person_id`);--> statement-breakpoint
CREATE INDEX `sop_signature_policy` ON `sop_signatures` (`policy_key`);