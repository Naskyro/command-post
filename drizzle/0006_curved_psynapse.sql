CREATE TABLE `stripe_payout_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`payrun_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`error` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`payrun_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`stripe_payout_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`arrival_date` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_payouts_stripe_payout_id_unique` ON `stripe_payouts` (`stripe_payout_id`);