CREATE TABLE `ccr_damage_source_inventory` (
	`idx_key` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`signature` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ccr_damage_source_inventory_case` ON `ccr_damage_source_inventory` (`case_id`);