CREATE TABLE IF NOT EXISTS vehicle_dispositions (
  id TEXT PRIMARY KEY NOT NULL,
  vin TEXT,
  license_plate TEXT,
  license_plate_state TEXT,
  year INTEGER,
  make TEXT,
  model TEXT,
  color TEXT,
  mileage INTEGER,
  has_keys INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  condition_notes TEXT,

  -- Notices
  first_notice_date TEXT,
  first_notice_sent_by TEXT,
  second_notice_date TEXT,
  second_notice_due_date TEXT,

  -- VTR-265 / TCSO
  vtr_265_picked_up INTEGER NOT NULL DEFAULT 0,
  vtr_265_pickup_date TEXT,

  -- Disposition recommendation & approval
  recommended_disposition TEXT,
  recommended_by TEXT,
  approved_disposition TEXT,
  approved_by TEXT,

  -- Estimates
  retail_estimate REAL,
  auction_estimate REAL,
  part_out_estimate REAL,
  scrap_estimate REAL,

  -- Sale
  sale_price REAL,
  sale_platform TEXT,
  buyer_name TEXT,
  sale_date TEXT,
  days_on_market INTEGER,

  -- Costs
  towing_cost REAL,
  storage_cost REAL,
  listing_cost REAL,
  marketing_cost REAL,
  commission REAL,
  other_costs REAL,
  net_recovery REAL,

  -- Towbook
  towbook_call_number TEXT,
  released_from_towbook INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'intake',
  assigned_to TEXT,

  -- Record control
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS vehicle_dispositions_status_idx ON vehicle_dispositions(status);
CREATE INDEX IF NOT EXISTS vehicle_dispositions_vin_idx ON vehicle_dispositions(vin);
