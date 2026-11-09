CREATE TABLE IF NOT EXISTS hr_accident_medical_versions (
 id TEXT NOT NULL,
 version INTEGER NOT NULL,
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY (id,version)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hr_accident_medical_access (
 id TEXT PRIMARY KEY NOT NULL,
 case_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 at TEXT NOT NULL,
 action TEXT NOT NULL
);
