CREATE TABLE IF NOT EXISTS ccr_court_upload_stages(id TEXT PRIMARY KEY, actor TEXT NOT NULL, expires_at INTEGER NOT NULL, parts INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ccr_stage_expiry ON ccr_court_upload_stages(expires_at);
CREATE INDEX IF NOT EXISTS ccr_stage_actor ON ccr_court_upload_stages(actor);
