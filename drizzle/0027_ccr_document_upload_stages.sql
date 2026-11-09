CREATE TABLE IF NOT EXISTS ccr_document_upload_stages (
 id TEXT PRIMARY KEY,
 principal TEXT NOT NULL,
 expires INTEGER NOT NULL,
 parts INTEGER NOT NULL,
 payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ccr_docstage_principal ON ccr_document_upload_stages(principal,expires);
CREATE INDEX IF NOT EXISTS ccr_docstage_expiry ON ccr_document_upload_stages(expires);
