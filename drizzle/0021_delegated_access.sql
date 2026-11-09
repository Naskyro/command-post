CREATE TABLE `delegated_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`actor_person` text NOT NULL,
	`actor_key` text NOT NULL,
	`actor_name` text NOT NULL,
	`subject_person` text NOT NULL,
	`subject_name` text NOT NULL,
	`reason` text NOT NULL,
	`started_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`ended_at` text,
	`end_reason` text
);
--> statement-breakpoint
CREATE INDEX `delegated_session_expiry` ON `delegated_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `delegated_session_actor` ON `delegated_sessions` (`actor_person`);
--> statement-breakpoint
CREATE TRIGGER delegated_audit_no_update BEFORE UPDATE ON finance_audit
WHEN OLD.record_id LIKE 'delegated-access:%' OR NEW.record_id LIKE 'delegated-access:%'
BEGIN SELECT RAISE(ABORT,'Delegated access audit entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER delegated_audit_no_delete BEFORE DELETE ON finance_audit
WHEN OLD.record_id LIKE 'delegated-access:%'
BEGIN SELECT RAISE(ABORT,'Delegated access audit entries are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER delegated_audit_no_replace BEFORE INSERT ON finance_audit
WHEN EXISTS(SELECT 1 FROM finance_audit WHERE id=NEW.id AND record_id LIKE 'delegated-access:%')
BEGIN SELECT RAISE(ABORT,'Delegated access audit entries are append-only'); END;
