CREATE TABLE IF NOT EXISTS ccr_damage_photo_previews(
 idx_key TEXT PRIMARY KEY NOT NULL,
 case_id TEXT NOT NULL,
 signature TEXT NOT NULL,
 payload TEXT NOT NULL,
 image BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS ccr_damage_photo_previews_case ON ccr_damage_photo_previews(case_id);
