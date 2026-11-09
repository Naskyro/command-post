CREATE TABLE `sop_policy_opens` (
	`person_id` text NOT NULL,
	`policy_key` text NOT NULL,
	`opened_at` text NOT NULL,
	PRIMARY KEY(`person_id`, `policy_key`)
);
