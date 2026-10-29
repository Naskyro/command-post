CREATE TABLE `finance_payroll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`pay_date` text NOT NULL,
	`gross_pay` real NOT NULL,
	`federal_withholding` real NOT NULL,
	`fica_employee` real NOT NULL,
	`fica_employer` real NOT NULL,
	`state_withholding` real NOT NULL,
	`twc` real NOT NULL,
	`net_pay` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finance_payroll_employee_idx` ON `finance_payroll_runs` (`employee_id`);