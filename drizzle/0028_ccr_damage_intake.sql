CREATE TABLE IF NOT EXISTS ccr_damage_intake_versions (id TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (id,version));
CREATE TABLE IF NOT EXISTS ccr_damage_intake_sources (lookup TEXT PRIMARY KEY, id TEXT NOT NULL);
