CREATE TABLE `admin_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`module` text NOT NULL,
	`tab` text,
	`actions` text NOT NULL,
	`scope` text,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_permissions_role_idx` ON `admin_permissions` (`role_id`);--> statement-breakpoint
CREATE TABLE `admin_role_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`department_id` text,
	`effective_date` text NOT NULL,
	`end_date` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_role_assignments_user_idx` ON `admin_role_assignments` (`user_id`);--> statement-breakpoint
CREATE INDEX `admin_role_assignments_role_idx` ON `admin_role_assignments` (`role_id`);--> statement-breakpoint
CREATE TABLE `admin_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_roles_name_unique` ON `admin_roles` (`name`);--> statement-breakpoint
CREATE TABLE `cash_register` (
	`id` text PRIMARY KEY NOT NULL,
	`fund_type` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`last_reconciled_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_register_fund_type_unique` ON `cash_register` (`fund_type`);--> statement-breakpoint
CREATE TABLE `cash_withdrawal` (
	`id` text PRIMARY KEY NOT NULL,
	`amount` real NOT NULL,
	`purpose` text NOT NULL,
	`requested_by` text NOT NULL,
	`approved_by` text,
	`status` text DEFAULT 'Open' NOT NULL,
	`receipt_amount` real,
	`returned_cash` real,
	`completed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_number` text NOT NULL,
	`account_name` text NOT NULL,
	`account_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_accounts_account_number_unique` ON `finance_accounts` (`account_number`);--> statement-breakpoint
CREATE TABLE `finance_journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text,
	`debit_account` text,
	`debit_amount` real,
	`credit_account` text,
	`credit_amount` real,
	`description` text,
	`posted_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finance_journal_transaction_idx` ON `finance_journal_entries` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `finance_tax_reserves` (
	`id` text PRIMARY KEY NOT NULL,
	`payroll_run_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`federal_withholding` real NOT NULL,
	`fica_employee_portion` real NOT NULL,
	`fica_employer_portion` real NOT NULL,
	`state_withholding` real NOT NULL,
	`twc_unemployment` real NOT NULL,
	`total_reserve_amount` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finance_tax_payroll_idx` ON `finance_tax_reserves` (`payroll_run_id`);