CREATE TABLE IF NOT EXISTS compliance_obligations (
  id TEXT PRIMARY KEY NOT NULL,
  obligation TEXT NOT NULL,
  applies_to TEXT NOT NULL,
  due_date TEXT,
  owner TEXT,
  evidence_required TEXT,
  work_effect TEXT,
  status TEXT NOT NULL DEFAULT 'Upcoming',
  recurrence TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
