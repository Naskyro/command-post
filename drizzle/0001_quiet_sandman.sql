CREATE TABLE `finance_payroll_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`remaining` integer NOT NULL,
	CONSTRAINT "payroll_balance_nonnegative" CHECK("finance_payroll_balances"."remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE `finance_payroll_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`run` text NOT NULL
);
