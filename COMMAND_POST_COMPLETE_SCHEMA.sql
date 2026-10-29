-- ============================================================================
-- COMMAND POST - COMPLETE DATABASE SCHEMA
-- PostgreSQL via Supabase
-- 
-- This schema covers:
--   FOUNDATION: Auth, permissions, audit, files, configurable lists
--   MODULE 1: Account Management (full property lifecycle)
--   MODULE 2: Account Hub (dispatcher reference - same tables, filtered views)
--   MODULE 3: Finance (cash, payroll, receivables, debts, bookkeeping)
--   MODULE 4: Timeclock (shifts, clock events, breaks, corrections, PTO)
--   SAFETY: Trespass & CTW (shared by dispatch + account management)
--   LATER: Sales CRM, Work Orders, Compliance, Vehicle Disposition, HR, Admin
--
-- Naming: snake_case everywhere (SQL standard)
-- Soft deletes: is_active / status fields (never hard delete operational data)
-- Audit: All mutating operations log to audit_logs
-- Timestamps: All tables include created_at, updated_at
-- ============================================================================


-- ============================================================================
-- FOUNDATION: EXTENSIONS & TYPES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Global enum types
CREATE TYPE user_role AS ENUM (
  'owner',
  'operations_director',
  'department_head',
  'account_manager',
  'dispatcher',
  'driver',
  'finance',
  'hr',
  'office_admin',
  'operations_coordinator'
);

CREATE TYPE account_status AS ENUM (
  'pending',
  'active',
  'paused',
  'terminated'
);

CREATE TYPE service_level AS ENUM (
  'full_patrol',
  'basic_patrol',
  'call_in'
);

CREATE TYPE property_type AS ENUM (
  'residential',
  'commercial',
  'mixed_use',
  'student',
  'hotel',
  'industrial',
  'other'
);

CREATE TYPE health_status AS ENUM (
  'healthy',
  'needs_attention',
  'at_risk',
  'recovering'
);

CREATE TYPE handoff_urgency AS ENUM (
  'regular',
  'urgent'
);

CREATE TYPE handoff_state AS ENUM (
  'active',
  'acknowledged',
  'resolved',
  'archived'
);

CREATE TYPE ctw_status AS ENUM (
  'not_requested',
  'requested',
  'requested_not_issued',
  'issued',
  'not_issued',
  'revoked'
);

CREATE TYPE break_type AS ENUM (
  'paid',
  'unpaid'
);

CREATE TYPE clock_event_type AS ENUM (
  'clock_in',
  'clock_out',
  'break_start',
  'break_end'
);

CREATE TYPE pay_class AS ENUM (
  'hourly',
  'salary_exempt',
  'commission_per_tow',
  'commission_vehicle_sale',
  'contract_bonus',
  'salary_plus_commission'
);

CREATE TYPE payroll_status AS ENUM (
  'draft',
  'pending_review',
  'approved',
  'released',
  'voided',
  'reversed',
  'corrected'
);

CREATE TYPE transaction_type AS ENUM (
  'money_in',
  'money_out',
  'transfer'
);

CREATE TYPE payment_state AS ENUM (
  'recorded',
  'approved',
  'queued',
  'sent',
  'cleared',
  'voided',
  'reversed',
  'returned'
);

CREATE TYPE agreement_status AS ENUM (
  'verified',
  'pending_review',
  'expired',
  'not_applicable',
  'absent'
);

CREATE TYPE work_order_status AS ENUM (
  'requested',
  'assigned',
  'in_progress',
  'completed',
  'approved',
  'closed'
);

CREATE TYPE work_order_priority AS ENUM (
  'critical',
  'high',
  'routine'
);

CREATE TYPE claim_status AS ENUM (
  'intake',
  'investigating',
  'amber_warning',
  'red_alert',
  'escalated',
  'settled',
  'closed'
);

CREATE TYPE hearing_status AS ENUM (
  'intake',
  'evidence_gathering',
  'court_prep',
  'hearing_scheduled',
  'outcome_recorded',
  'closed'
);

CREATE TYPE vehicle_disposition AS ENUM (
  'retail',
  'auction',
  'part_out',
  'scrap',
  'pending',
  'sold'
);


-- ============================================================================
-- FOUNDATION: USERS & AUTH
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  department VARCHAR(100),
  job_title VARCHAR(255),
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret VARCHAR(255),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255),
  device_id VARCHAR(255),
  device_name VARCHAR(255),
  is_trusted_device BOOLEAN DEFAULT false,
  ip_address VARCHAR(50),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);


-- ============================================================================
-- FOUNDATION: PERMISSIONS
-- ============================================================================

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  module VARCHAR(100) NOT NULL,          -- 'account_management', 'finance', etc.
  tab VARCHAR(100),                       -- 'accounts', 'payroll', 'today', etc.
  action VARCHAR(50) NOT NULL,            -- 'view', 'create', 'edit', 'approve', 'admin'
  scope_type VARCHAR(50),                 -- 'all', 'assigned', 'department', 'own'
  scope_value TEXT,                       -- specific IDs or department name
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_permissions_user ON permissions(user_id);
CREATE INDEX idx_permissions_module ON permissions(module);


-- ============================================================================
-- FOUNDATION: AUDIT LOG
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,           -- 'create', 'update', 'delete', 'login', etc.
  entity_type VARCHAR(100) NOT NULL,      -- 'account', 'user', 'payroll_run', etc.
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  ip_address VARCHAR(50),
  source_module VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);


-- ============================================================================
-- FOUNDATION: FILE UPLOADS (S3/R2 references)
-- ============================================================================

CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  entity_type VARCHAR(100) NOT NULL,      -- 'account', 'claim', 'employee', etc.
  entity_id UUID NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100),                 -- MIME type
  file_size_bytes BIGINT,
  s3_key VARCHAR(1000) NOT NULL,
  s3_url TEXT,
  category VARCHAR(100),                  -- 'agreement', 'photo', 'evidence', etc.
  description TEXT,
  source VARCHAR(255),                    -- provenance: 'upload', 'towbook', 'gmail'
  source_date DATE,                       -- when the original was created
  review_status VARCHAR(50) DEFAULT 'unreviewed',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_files_entity ON file_uploads(entity_type, entity_id);


-- ============================================================================
-- FOUNDATION: CONFIGURABLE LISTS (dropdowns, work types, etc.)
-- ============================================================================

CREATE TABLE configurable_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_type VARCHAR(100) NOT NULL,        -- 'work_type', 'department', 'company', etc.
  label VARCHAR(255) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,         -- hidden from new choices, preserved on old records
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_config_lists_type ON configurable_lists(list_type);


-- ============================================================================
-- FOUNDATION: REAL-TIME EVENTS (WebSocket broadcast queue)
-- ============================================================================

CREATE TABLE real_time_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(100) NOT NULL,       -- 'hold_placed', 'handoff_created', etc.
  source_module VARCHAR(100),
  source_user_id UUID REFERENCES users(id),
  entity_type VARCHAR(100),
  entity_id UUID,
  data JSONB,
  affected_roles user_role[],
  affected_user_ids UUID[],
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_type ON real_time_events(event_type);
CREATE INDEX idx_events_created ON real_time_events(created_at);


-- ============================================================================
-- FOUNDATION: SCHEDULED JOBS (data sync, imports)
-- ============================================================================

CREATE TABLE scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name VARCHAR(255) NOT NULL UNIQUE,
  job_type VARCHAR(100) NOT NULL,         -- 'towbook_sync', 'towcentric_sync', 'gmail_check'
  schedule VARCHAR(100),                  -- cron expression
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_status VARCHAR(50),                -- 'success', 'failed', 'running'
  last_error TEXT,
  row_count INT,
  config JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- MODULE: ACCOUNT MANAGEMENT & ACCOUNT HUB
-- ============================================================================

-- Core property/account record (shared by Account Hub + Account Management)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  property_name VARCHAR(500) NOT NULL,
  address_line1 VARCHAR(500),
  address_line2 VARCHAR(255),
  city VARCHAR(100) DEFAULT 'Austin',
  state VARCHAR(50) DEFAULT 'TX',
  zip VARCHAR(20),
  property_type property_type DEFAULT 'residential',
  
  -- Status & Service
  status account_status DEFAULT 'pending',
  service_level service_level,
  health_status health_status,
  health_reviewed_at TIMESTAMPTZ,
  health_reason TEXT,
  
  -- Assignment
  account_manager_id UUID REFERENCES users(id),
  management_company_id UUID,             -- FK to management_companies
  
  -- Enforcement & Parking
  enforcement_times TEXT,                  -- e.g. "6pm - 7am"
  enforcement_days TEXT,                   -- e.g. "Mon-Sun"
  towing_limit_per_night INT,
  towing_limit_per_week INT,
  towing_limit_source VARCHAR(50),         -- 'property' or 'internal'
  visitor_parking_enforced BOOLEAN,
  visitor_parking_location TEXT,
  visitor_section TEXT,
  visitor_monthly_limit INT,
  visitor_duration_hours INT,
  visitor_consecutive_day_limit INT,
  resident_validation_required BOOLEAN,
  ev_enforcement BOOLEAN,
  leasing_office_towing VARCHAR(20),       -- 'yes', 'no', 'not_applicable'
  
  -- Carport (conditional - only if has_carport = true)
  has_carport BOOLEAN DEFAULT false,
  carport_enforcement_method VARCHAR(100), -- 'patrollable', 'call_in_only'
  carport_call_authority TEXT,             -- who can authorize carport tow
  
  -- Garage (conditional)
  has_private_garages BOOLEAN DEFAULT false,
  has_parking_garage BOOLEAN DEFAULT false,
  garage_visitor_location TEXT,            -- e.g. "top floor uncovered"
  garage_commercial_separation TEXT,
  
  -- Permits (rules only - TowCentric is authority)
  permit_type VARCHAR(50),                 -- 'digital', 'physical', 'both', 'none'
  permit_platform VARCHAR(100) DEFAULT 'TowCentric',
  physical_permit_type VARCHAR(50),        -- 'hang_tag', 'windshield_sticker', 'both', 'other'
  vehicles_per_leaseholder INT,            -- INTEGER only, no decimals
  
  -- Authorization
  who_can_authorize_tow TEXT,
  authorized_callers TEXT,
  after_hours_restrictions TEXT,
  
  -- Jurisdiction
  reporting_jurisdiction VARCHAR(100),     -- 'Travis/APD', 'Travis/TCSO', etc.
  
  -- Operating instructions (free text for dispatch)
  operating_instructions TEXT,
  
  -- Contract / Agreement
  agreement_status agreement_status,
  agreement_start_date DATE,
  agreement_end_date DATE,
  agreement_term_months INT,
  cancellation_notice_days INT,            -- e.g. 30-day notice clause
  auto_renewal BOOLEAN,
  
  -- Revenue (visible to Account Management, NOT Account Hub)
  annual_revenue DECIMAL(12,2),
  revenue_coverage_start DATE,
  revenue_coverage_end DATE,
  
  -- Dates
  account_start_date DATE,
  activation_date DATE,
  pause_date DATE,
  pause_reason TEXT,
  termination_date DATE,
  termination_reason TEXT,
  
  -- Photos
  primary_photo_url TEXT,
  primary_photo_source TEXT,
  primary_photo_verified_at TIMESTAMPTZ,
  
  -- Onboarding
  onboarding_completion_pct INT DEFAULT 0,
  onboarding_checklist JSONB,
  
  -- Metadata
  version INT DEFAULT 1,                   -- optimistic concurrency
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_manager ON accounts(account_manager_id);
CREATE INDEX idx_accounts_service ON accounts(service_level);
CREATE INDEX idx_accounts_health ON accounts(health_status);
CREATE INDEX idx_accounts_name ON accounts(property_name);


-- Management companies
CREATE TABLE management_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(500) NOT NULL,
  website VARCHAR(500),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE accounts 
  ADD CONSTRAINT fk_accounts_mgmt_company 
  FOREIGN KEY (management_company_id) REFERENCES management_companies(id);


-- Property contacts (managers, leasing staff, etc.)
CREATE TABLE account_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  
  -- Identity
  full_name VARCHAR(255) NOT NULL,
  role_at_property VARCHAR(100),           -- 'property_manager', 'assistant_manager', 'regional_manager', etc.
  email VARCHAR(255),
  personal_phone VARCHAR(50),
  work_phone VARCHAR(50),
  work_phone_property_note TEXT,           -- "This was her number at Agave East"
  
  -- Relationship context (restricted - not visible to dispatch)
  linkedin_url VARCHAR(500),
  approximate_age INT,
  age_as_of_date DATE,
  date_of_birth DATE,
  industry_start_year INT,
  years_in_current_role INT,
  interests TEXT,
  work_style TEXT,
  preferences TEXT,
  likes TEXT,
  dislikes TEXT,
  family_notes TEXT,
  
  -- Decision authority
  can_authorize_tow BOOLEAN DEFAULT false,
  can_authorize_space_call BOOLEAN DEFAULT false,
  decision_authority_notes TEXT,
  
  -- Profile photo
  photo_url TEXT,
  
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_account ON account_contacts(account_id);


-- Dated affiliations (manager ↔ property over time)
CREATE TABLE account_affiliations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES account_contacts(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  management_company_id UUID REFERENCES management_companies(id),
  
  role VARCHAR(100) NOT NULL,              -- role at this property during this period
  start_date DATE,
  end_date DATE,                           -- NULL = current
  
  -- Revenue during tenure
  revenue_during_tenure DECIMAL(12,2),
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliations_contact ON account_affiliations(contact_id);
CREATE INDEX idx_affiliations_account ON account_affiliations(account_id);


-- Account agreements (towing contracts, amendments)
CREATE TABLE account_agreements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  
  agreement_type VARCHAR(100),             -- 'towing_agreement', 'amendment', 'authorization_form'
  status agreement_status DEFAULT 'pending_review',
  effective_date DATE,
  expiration_date DATE,
  term_months INT,
  cancellation_notice_days INT,
  auto_renewal BOOLEAN,
  
  file_id UUID REFERENCES file_uploads(id),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  clause_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agreements_account ON account_agreements(account_id);


-- Account timeline / activity log
CREATE TABLE account_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  user_id UUID REFERENCES users(id),
  
  activity_type VARCHAR(100) NOT NULL,     -- 'note', 'visit', 'call', 'email', 'status_change', etc.
  title VARCHAR(500),
  description TEXT,
  
  -- Visit-specific
  visit_type VARCHAR(50),                  -- 'in_person', 'video', 'phone', 'email', 'text'
  mileage_logged DECIMAL(8,2),             -- for reimbursement
  mileage_vehicle VARCHAR(50),             -- 'personal', 'company', 'carpool'
  
  -- Contact info
  contact_id UUID REFERENCES account_contacts(id),
  client_sentiment VARCHAR(50),            -- 'positive', 'neutral', 'concerned', 'negative'
  
  -- Promises / follow-ups
  promise_made TEXT,
  promise_owner_id UUID REFERENCES users(id),
  promise_due_date DATE,
  promise_completed BOOLEAN DEFAULT false,
  
  -- Source
  source VARCHAR(50),                      -- 'manual', 'gmail', 'dispatch_handoff', 'system'
  source_reference TEXT,                   -- email ID, handoff ID, etc.
  
  is_starred BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_account ON account_activities(account_id);
CREATE INDEX idx_activities_type ON account_activities(activity_type);
CREATE INDEX idx_activities_created ON account_activities(created_at);


-- Courtesy releases tracking
CREATE TABLE courtesy_releases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  
  -- Vehicle
  vin VARCHAR(50),
  license_plate VARCHAR(20),
  license_plate_state VARCHAR(10),
  vehicle_description TEXT,
  
  -- Release details
  original_charge DECIMAL(10,2),
  final_amount DECIMAL(10,2),
  amount_waived DECIMAL(10,2),
  release_type VARCHAR(50),                -- 'full_courtesy', 'reduced', 'management_request'
  reason_category VARCHAR(100),
  reason_details TEXT,
  
  -- Approval
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  -- Towbook reference
  towbook_call_number VARCHAR(50),
  towbook_reference TEXT,
  
  -- Contact / manager during release
  property_manager_id UUID REFERENCES account_contacts(id),
  
  release_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_courtesy_account ON courtesy_releases(account_id);
CREATE INDEX idx_courtesy_vin ON courtesy_releases(vin);
CREATE INDEX idx_courtesy_plate ON courtesy_releases(license_plate);
CREATE INDEX idx_courtesy_date ON courtesy_releases(release_date);


-- ============================================================================
-- DISPATCH HANDOFF INBOX
-- ============================================================================

CREATE TABLE dispatch_handoffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source
  created_by UUID NOT NULL REFERENCES users(id),       -- dispatcher
  
  -- Target
  account_id UUID REFERENCES accounts(id),
  assigned_to UUID REFERENCES users(id),                -- account manager
  
  -- Content
  urgency handoff_urgency DEFAULT 'regular',
  state handoff_state DEFAULT 'active',
  category VARCHAR(100),                                -- 'tow_heads_up', 'complaint', 'stolen_vehicle', etc.
  
  title VARCHAR(500),
  narrative TEXT NOT NULL,
  
  -- Vehicle / person context
  license_plate VARCHAR(20),
  vin VARCHAR(50),
  incident_date DATE,
  towbook_reference VARCHAR(100),
  
  -- State tracking
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  is_starred BOOLEAN DEFAULT false,
  auto_archive_at TIMESTAMPTZ,                          -- 7 days after creation for regular
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handoffs_assigned ON dispatch_handoffs(assigned_to);
CREATE INDEX idx_handoffs_account ON dispatch_handoffs(account_id);
CREATE INDEX idx_handoffs_state ON dispatch_handoffs(state);
CREATE INDEX idx_handoffs_urgency ON dispatch_handoffs(urgency);

-- Handoff replies (threaded conversation)
CREATE TABLE dispatch_handoff_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  handoff_id UUID NOT NULL REFERENCES dispatch_handoffs(id),
  user_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handoff_replies ON dispatch_handoff_replies(handoff_id);


-- ============================================================================
-- SAFETY: TRESPASS & CTW
-- ============================================================================

CREATE TABLE ctw_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Person
  person_name VARCHAR(255) NOT NULL,
  aliases TEXT,
  
  -- Vehicle association
  vehicle_plate VARCHAR(20),
  vehicle_vin VARCHAR(50),
  vehicle_description TEXT,
  
  -- Incident
  originating_account_id UUID REFERENCES accounts(id),
  incident_date DATE,
  incident_location TEXT,
  observed_behavior TEXT NOT NULL,
  threats_made TEXT,
  
  -- CTW details (premises always = company yard)
  ctw_status ctw_status DEFAULT 'not_requested',
  ctw_premises TEXT DEFAULT 'Parking & Towing Enforcement, 7511 Dee Gabriel Collins Rd, Austin TX 78744',
  
  -- Law enforcement
  law_enforcement_agency VARCHAR(255),
  officer_name VARCHAR(255),
  officer_badge VARCHAR(50),
  case_number VARCHAR(100),
  charges TEXT,
  warrant_issued BOOLEAN DEFAULT false,
  warrant_details TEXT,
  
  -- Property manager communication
  property_manager_notified BOOLEAN DEFAULT false,
  property_manager_notes TEXT,
  
  -- Investigation
  investigation_status VARCHAR(50),        -- 'open', 'under_review', 'closed'
  next_follow_up DATE,
  
  -- Disposition
  final_disposition TEXT,
  disposition_date DATE,
  
  -- Alert state
  alert_active BOOLEAN DEFAULT true,
  alert_acknowledged_by UUID REFERENCES users(id),
  alert_acknowledged_at TIMESTAMPTZ,
  
  -- Ownership
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ctw_plate ON ctw_records(vehicle_plate);
CREATE INDEX idx_ctw_vin ON ctw_records(vehicle_vin);
CREATE INDEX idx_ctw_alert ON ctw_records(alert_active);
CREATE INDEX idx_ctw_status ON ctw_records(ctw_status);


-- ============================================================================
-- FINANCE: BOOKKEEPING & CASH
-- ============================================================================

-- Finance categories (exact list from Jerson)
CREATE TABLE finance_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  parent_category_id UUID REFERENCES finance_categories(id),
  budget_amount DECIMAL(12,2),             -- NULL = no budget set
  budget_period VARCHAR(20),               -- 'monthly', 'quarterly', 'annual'
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Finance transactions (bank evidence, cash, all money movement)
CREATE TABLE finance_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source evidence
  source VARCHAR(100) NOT NULL,            -- 'chase_import', 'manual', 'towbook', 'cash_bag'
  source_id VARCHAR(255),                  -- external transaction ID for dedup
  source_fingerprint VARCHAR(255),         -- normalized dedup key
  
  transaction_type transaction_type NOT NULL,
  payment_state payment_state DEFAULT 'recorded',
  
  -- Money
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  
  -- Category
  category_id UUID REFERENCES finance_categories(id),
  is_split BOOLEAN DEFAULT false,
  
  -- Context
  description TEXT,
  payee_or_payer VARCHAR(500),
  account_id UUID REFERENCES accounts(id), -- linked property if applicable
  
  -- Dates
  transaction_date DATE NOT NULL,
  posted_date DATE,
  
  -- Evidence
  receipt_file_id UUID REFERENCES file_uploads(id),
  
  -- Review
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  reconciled BOOLEAN DEFAULT false,
  reconciliation_notes TEXT,
  
  -- ATM / cash handling
  is_atm_withdrawal BOOLEAN DEFAULT false,
  is_cash_transfer BOOLEAN DEFAULT false,  -- bank→cash, not an expense
  
  -- Flags
  flagged_for_review BOOLEAN DEFAULT false,
  flag_reason TEXT,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_finance_source ON finance_transactions(source, source_id);
CREATE INDEX idx_finance_date ON finance_transactions(transaction_date);
CREATE INDEX idx_finance_category ON finance_transactions(category_id);
CREATE INDEX idx_finance_type ON finance_transactions(transaction_type);
CREATE INDEX idx_finance_fingerprint ON finance_transactions(source_fingerprint);

-- Split allocations (when one transaction hits multiple categories)
CREATE TABLE finance_split_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES finance_transactions(id),
  category_id UUID NOT NULL REFERENCES finance_categories(id),
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_splits_transaction ON finance_split_lines(transaction_id);


-- Cash bags / drawers (custody tracking)
CREATE TABLE cash_bags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bag_label VARCHAR(100),
  
  current_custodian_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'open',       -- 'open', 'sealed', 'deposited', 'partial'
  
  total_collected DECIMAL(10,2),
  amount_used_for_repairs DECIMAL(10,2) DEFAULT 0,
  amount_deposited DECIMAL(10,2) DEFAULT 0,
  amount_remaining DECIMAL(10,2),
  unexplained_difference DECIMAL(10,2) DEFAULT 0,
  
  collection_date DATE,
  deposit_date DATE,
  
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cash bag custody transfers
CREATE TABLE cash_bag_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_bag_id UUID NOT NULL REFERENCES cash_bags(id),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(10,2),
  transfer_type VARCHAR(50),               -- 'full_handoff', 'partial_use', 'deposit'
  notes TEXT,
  transferred_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- FINANCE: PAYROLL
-- ============================================================================

-- Pay agreements (effective-dated employee pay rules)
CREATE TABLE pay_agreements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  pay_class pay_class NOT NULL,
  hourly_rate DECIMAL(8,2),
  salary_amount DECIMAL(12,2),
  salary_period VARCHAR(20),               -- 'weekly', 'biweekly', 'monthly', 'annual'
  commission_rate DECIMAL(5,2),            -- percentage
  commission_type VARCHAR(100),            -- 'per_tow', 'per_vehicle_sale', 'contract_bonus'
  
  effective_date DATE NOT NULL,
  end_date DATE,                           -- NULL = current
  
  overtime_eligible BOOLEAN DEFAULT true,
  overtime_rate_multiplier DECIMAL(4,2) DEFAULT 1.5,
  
  notes TEXT,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pay_agreements_employee ON pay_agreements(employee_id);
CREATE INDEX idx_pay_agreements_effective ON pay_agreements(effective_date);


-- Payroll runs (versioned, approvable, releasable)
CREATE TABLE payroll_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  run_type VARCHAR(50) DEFAULT 'regular',  -- 'regular', 'supplemental', 'final_pay', 'correction'
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  
  status payroll_status DEFAULT 'draft',
  version INT DEFAULT 1,                   -- increments on edit, approval locks version
  
  -- Totals
  total_gross DECIMAL(12,2),
  total_deductions DECIMAL(12,2),
  total_employer_cost DECIMAL(12,2),
  total_net DECIMAL(12,2),
  
  -- Approval chain
  prepared_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approved_version INT,                     -- must match version at approval time
  released_by UUID REFERENCES users(id),   -- ONLY owners or operations director
  released_at TIMESTAMPTZ,
  
  voided_by UUID REFERENCES users(id),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payroll_period ON payroll_runs(pay_period_start, pay_period_end);
CREATE INDEX idx_payroll_status ON payroll_runs(status);


-- Payroll line items (per employee per run)
CREATE TABLE payroll_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id),
  employee_id UUID NOT NULL REFERENCES users(id),
  pay_agreement_id UUID REFERENCES pay_agreements(id),
  
  -- Hours
  regular_hours DECIMAL(6,2),
  overtime_hours DECIMAL(6,2),
  
  -- Earnings
  gross_pay DECIMAL(10,2),
  regular_pay DECIMAL(10,2),
  overtime_pay DECIMAL(10,2),
  commission_pay DECIMAL(10,2),
  bonus_pay DECIMAL(10,2),
  reimbursements DECIMAL(10,2),
  
  -- Deductions
  total_deductions DECIMAL(10,2),
  deduction_details JSONB,                 -- { "type": "amount" } breakdown
  
  -- Net
  net_pay DECIMAL(10,2),
  employer_cost DECIMAL(10,2),
  
  -- Payment
  payment_method VARCHAR(50),              -- 'direct_deposit', 'check', 'cash'
  payment_state payment_state DEFAULT 'recorded',
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payroll_lines_run ON payroll_line_items(payroll_run_id);
CREATE INDEX idx_payroll_lines_employee ON payroll_line_items(employee_id);


-- ============================================================================
-- FINANCE: RECEIVABLES
-- ============================================================================

CREATE TABLE receivables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id),
  
  source VARCHAR(100),                     -- 'towbook_release', 'invoice', 'vehicle_sale'
  source_reference VARCHAR(255),           -- Towbook call number, invoice number
  
  original_amount DECIMAL(10,2) NOT NULL,
  amount_collected DECIMAL(10,2) DEFAULT 0,
  amount_waived DECIMAL(10,2) DEFAULT 0,
  balance_due DECIMAL(10,2),
  
  due_date DATE,
  status VARCHAR(50) DEFAULT 'outstanding', -- 'outstanding', 'partial', 'paid', 'waived', 'written_off'
  
  -- Chargeback tracking
  is_chargeback BOOLEAN DEFAULT false,
  chargeback_amount DECIMAL(10,2),
  chargeback_status VARCHAR(50),           -- 'disputed', 'evidence_submitted', 'won', 'lost'
  chargeback_processor VARCHAR(100),
  
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receivables_account ON receivables(account_id);
CREATE INDEX idx_receivables_status ON receivables(status);


-- ============================================================================
-- FINANCE: DEBTS
-- ============================================================================

CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  lender VARCHAR(500),
  description TEXT,
  principal DECIMAL(12,2),
  interest_rate DECIMAL(5,2),
  monthly_payment DECIMAL(10,2),
  
  start_date DATE,
  maturity_date DATE,
  
  current_balance DECIMAL(12,2),
  status VARCHAR(50) DEFAULT 'active',     -- 'active', 'paid_off', 'refinanced'
  
  collateral TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- FINANCE: COMPANY ASSETS (replaces "Supplies" tab)
-- ============================================================================

CREATE TABLE company_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  asset_name VARCHAR(500) NOT NULL,
  category VARCHAR(100),                   -- 'tow_truck', 'vehicle', 'laptop', 'equipment', etc.
  brand VARCHAR(255),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  
  purchase_date DATE,
  purchase_price DECIMAL(12,2),
  current_value DECIMAL(12,2),
  depreciation_method VARCHAR(50),
  
  assigned_to UUID REFERENCES users(id),
  location TEXT,
  condition VARCHAR(50),                   -- 'new', 'good', 'fair', 'poor', 'retired'
  
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assets_category ON company_assets(category);


-- ============================================================================
-- FINANCE: EMPLOYEE EXPENSE REPORTS (debit/credit card + cash)
-- ============================================================================

CREATE TABLE expense_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  report_period_start DATE,
  report_period_end DATE,
  due_date DATE,                           -- default: Friday midnight of that week
  
  status VARCHAR(50) DEFAULT 'open',       -- 'open', 'submitted', 'approved', 'rejected'
  total_amount DECIMAL(10,2) DEFAULT 0,
  
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expense_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_report_id UUID NOT NULL REFERENCES expense_reports(id),
  
  payment_method VARCHAR(50),              -- 'company_card', 'cash', 'personal_reimbursement'
  category_id UUID REFERENCES finance_categories(id),
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  vendor VARCHAR(255),
  transaction_date DATE,
  receipt_file_id UUID REFERENCES file_uploads(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- TIMECLOCK
-- ============================================================================

-- Clock events (the raw time record)
CREATE TABLE clock_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  event_type clock_event_type NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  
  -- Break specifics
  break_type break_type,                   -- only for break_start
  is_duty_free BOOLEAN,                    -- only unpaid + duty_free deducts time
  
  -- Source
  source VARCHAR(50) DEFAULT 'employee',   -- 'employee', 'supervisor', 'correction', 'system'
  
  -- Location context
  ip_address VARCHAR(50),
  
  is_correction BOOLEAN DEFAULT false,
  original_event_id UUID REFERENCES clock_events(id),
  correction_reason TEXT,
  correction_approved_by UUID REFERENCES users(id),
  correction_approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clock_employee ON clock_events(employee_id);
CREATE INDEX idx_clock_time ON clock_events(event_time);
CREATE INDEX idx_clock_type ON clock_events(event_type);


-- Shift schedules
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES users(id),   -- NULL = open shift
  department VARCHAR(100),
  
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_overnight BOOLEAN DEFAULT false,
  
  status VARCHAR(50) DEFAULT 'scheduled',  -- 'scheduled', 'open', 'claimed', 'completed', 'cancelled'
  
  claimed_by UUID REFERENCES users(id),
  claimed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shifts_employee ON shifts(employee_id);
CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_shifts_status ON shifts(status);


-- Timesheets (weekly summary, feeds payroll)
CREATE TABLE timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  week_start DATE NOT NULL,                -- Sunday
  week_end DATE NOT NULL,                  -- Saturday
  
  total_regular_hours DECIMAL(6,2),
  total_overtime_hours DECIMAL(6,2),
  total_break_minutes INT,
  total_paid_break_minutes INT,
  total_unpaid_break_minutes INT,
  
  status VARCHAR(50) DEFAULT 'pending',    -- 'pending', 'submitted', 'approved', 'disputed'
  
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  pay_agreement_id UUID REFERENCES pay_agreements(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timesheets_employee ON timesheets(employee_id);
CREATE INDEX idx_timesheets_week ON timesheets(week_start);


-- Time correction requests
CREATE TABLE time_corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  correction_type VARCHAR(50),             -- 'missed_punch', 'wrong_time', 'missed_break'
  original_event_id UUID REFERENCES clock_events(id),
  
  requested_time TIMESTAMPTZ,
  requested_type clock_event_type,
  reason TEXT NOT NULL,
  
  status VARCHAR(50) DEFAULT 'pending',    -- 'pending', 'approved', 'rejected'
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_corrections_employee ON time_corrections(employee_id);
CREATE INDEX idx_corrections_status ON time_corrections(status);


-- Time off requests (PTO, comp time, etc.)
CREATE TABLE time_off_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  request_type VARCHAR(50),                -- 'pto', 'comp_time', 'sick', 'personal', 'bereavement'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_requested DECIMAL(6,2),
  
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending',    -- 'pending', 'approved', 'rejected', 'cancelled'
  
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_off_employee ON time_off_requests(employee_id);


-- ============================================================================
-- LATER MODULES (Tables exist but modules not priority)
-- ============================================================================

-- Towbook data imports (daily sync)
CREATE TABLE towbook_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_type VARCHAR(50) NOT NULL,        -- 'performance', 'calls', 'income'
  file_name VARCHAR(500),
  row_count INT,
  import_status VARCHAR(50),               -- 'success', 'partial', 'failed'
  error_details TEXT,
  imported_by UUID REFERENCES users(id),
  coverage_start DATE,
  coverage_end DATE,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicle history (from Towbook)
CREATE TABLE vehicle_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  vin VARCHAR(50),
  license_plate VARCHAR(20),
  license_plate_state VARCHAR(10),
  vehicle_description TEXT,
  
  account_id UUID REFERENCES accounts(id),
  towbook_call_number VARCHAR(50),
  
  event_type VARCHAR(50),                  -- 'tow', 'release', 'impound', 'courtesy_release'
  event_date TIMESTAMPTZ,
  driver_name VARCHAR(255),
  driver_notes TEXT,
  
  tow_reason VARCHAR(255),
  release_amount DECIMAL(10,2),
  payment_method VARCHAR(50),
  
  -- Import provenance
  import_id UUID REFERENCES towbook_imports(id),
  towbook_id VARCHAR(100),                 -- dedup key
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicle_vin ON vehicle_history(vin);
CREATE INDEX idx_vehicle_plate ON vehicle_history(license_plate);
CREATE INDEX idx_vehicle_account ON vehicle_history(account_id);
CREATE INDEX idx_vehicle_towbook ON vehicle_history(towbook_id);


-- Work orders
CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id),
  
  work_type VARCHAR(100),                  -- from configurable_lists
  category VARCHAR(50),                    -- 'property_service', 'facilities', 'it'
  priority work_order_priority DEFAULT 'routine',
  status work_order_status DEFAULT 'requested',
  
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location_details TEXT,
  
  requested_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  
  estimated_cost DECIMAL(10,2),
  actual_cost DECIMAL(10,2),
  cost_approved_by UUID REFERENCES users(id),
  
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  
  approved_by UUID REFERENCES users(id),   -- Austin approves completion
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_orders_account ON work_orders(account_id);
CREATE INDEX idx_work_orders_status ON work_orders(status);
CREATE INDEX idx_work_orders_assigned ON work_orders(assigned_to);


-- Damage claims
CREATE TABLE damage_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id),
  
  status claim_status DEFAULT 'intake',
  
  -- Claimant
  claimant_name VARCHAR(255),
  claimant_phone VARCHAR(50),
  claimant_email VARCHAR(255),
  
  -- Vehicle
  vin VARCHAR(50),
  license_plate VARCHAR(20),
  vehicle_description TEXT,
  
  -- Claim
  damage_description TEXT,
  alleged_date DATE,
  claim_amount DECIMAL(10,2),
  
  -- Investigation
  assigned_to UUID REFERENCES users(id),   -- account manager
  investigation_notes TEXT,
  liability_determination VARCHAR(50),     -- 'our_fault', 'not_our_fault', 'shared', 'undetermined'
  
  -- Settlement
  settlement_amount DECIMAL(10,2),
  settlement_approved_by UUID REFERENCES users(id),  -- Austin or Jerson
  settlement_approved_at TIMESTAMPTZ,
  
  -- Escalation
  escalated_to UUID REFERENCES users(id),
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  
  -- Towbook reference
  towbook_call_number VARCHAR(50),
  
  -- Dates
  amber_warning_at TIMESTAMPTZ,            -- 1 day no action
  red_alert_at TIMESTAMPTZ,                -- 3 days no action
  closed_at TIMESTAMPTZ,
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_claims_account ON damage_claims(account_id);
CREATE INDEX idx_claims_status ON damage_claims(status);
CREATE INDEX idx_claims_assigned ON damage_claims(assigned_to);


-- Tow hearings
CREATE TABLE tow_hearings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id),
  
  status hearing_status DEFAULT 'intake',
  
  -- Court info
  court_case_number VARCHAR(100),
  court_name VARCHAR(255),
  county VARCHAR(100),
  judge_name VARCHAR(255),
  hearing_date DATE,
  hearing_time TIME,
  
  -- Parties
  plaintiff_name VARCHAR(255),
  co_defendant_property VARCHAR(255),
  
  -- Tow details
  towbook_call_number VARCHAR(50),
  tow_date DATE,
  vehicle_description TEXT,
  amount_sought DECIMAL(10,2),
  plaintiff_grounds TEXT,
  
  -- Evidence
  evidence_complete BOOLEAN DEFAULT false,
  evidence_checklist JSONB,
  
  -- Outcome
  outcome VARCHAR(50),                     -- 'won', 'lost', 'settled', 'dismissed'
  settlement_amount DECIMAL(10,2),
  outcome_notes TEXT,
  
  -- Assignment
  assigned_to UUID REFERENCES users(id),
  
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hearings_account ON tow_hearings(account_id);
CREATE INDEX idx_hearings_status ON tow_hearings(status);
CREATE INDEX idx_hearings_date ON tow_hearings(hearing_date);


-- Chargebacks
CREATE TABLE chargebacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id),
  receivable_id UUID REFERENCES receivables(id),
  
  towbook_call_number VARCHAR(50),
  
  cardholder_name VARCHAR(255),
  dispute_amount DECIMAL(10,2),
  processor VARCHAR(100),                  -- 'GoDaddy', 'Square'
  
  status VARCHAR(50) DEFAULT 'disputed',   -- 'disputed', 'evidence_submitted', 'won', 'lost', 'recovered'
  
  evidence_submitted_at TIMESTAMPTZ,
  processor_decision VARCHAR(50),
  processor_decision_date DATE,
  
  -- Recovery
  recovery_attempted BOOLEAN DEFAULT false,
  recovery_amount DECIMAL(10,2),
  recovery_method VARCHAR(50),             -- 'cash', 'card', 'check'
  recovery_date DATE,
  
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chargebacks_account ON chargebacks(account_id);
CREATE INDEX idx_chargebacks_status ON chargebacks(status);


-- Vehicle disposition & sales (Braden)
CREATE TABLE vehicle_dispositions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Vehicle identity
  vin VARCHAR(50),
  license_plate VARCHAR(20),
  year INT,
  make VARCHAR(100),
  model VARCHAR(100),
  color VARCHAR(50),
  mileage INT,
  has_keys BOOLEAN,
  runs BOOLEAN,
  condition_notes TEXT,
  
  -- Notices
  first_notice_date DATE,
  first_notice_sent_by VARCHAR(100),       -- usually dispatch
  second_notice_date DATE,
  second_notice_due_date DATE,             -- auto-calculated
  
  -- VTR-265 / TCSO
  vtr_265_picked_up BOOLEAN DEFAULT false,
  vtr_265_pickup_date DATE,
  
  -- Disposition
  recommended_disposition vehicle_disposition,
  recommended_by UUID REFERENCES users(id),
  approved_disposition vehicle_disposition,
  approved_by UUID REFERENCES users(id),
  
  -- Estimates
  retail_estimate DECIMAL(10,2),
  auction_estimate DECIMAL(10,2),
  part_out_estimate DECIMAL(10,2),
  scrap_estimate DECIMAL(10,2),
  
  -- Sale
  sale_price DECIMAL(10,2),
  sale_platform VARCHAR(100),              -- 'facebook', 'private_buyer'
  buyer_name VARCHAR(255),
  sale_date DATE,
  days_on_market INT,
  
  -- Costs
  towing_cost DECIMAL(10,2),
  storage_cost DECIMAL(10,2),
  listing_cost DECIMAL(10,2),
  marketing_cost DECIMAL(10,2),
  commission DECIMAL(10,2),
  other_costs DECIMAL(10,2),
  net_recovery DECIMAL(10,2),              -- sale_price - all costs
  
  -- Towbook
  towbook_call_number VARCHAR(50),
  released_from_towbook BOOLEAN DEFAULT false,
  
  status VARCHAR(50) DEFAULT 'intake',     -- 'intake', 'notices', 'tcso', 'listed', 'sold', 'scrapped'
  assigned_to UUID REFERENCES users(id),   -- usually Braden
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dispositions_status ON vehicle_dispositions(status);
CREATE INDEX idx_dispositions_vin ON vehicle_dispositions(vin);


-- Employee HR records
CREATE TABLE employee_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Personal
  date_of_birth DATE,
  ssn_encrypted TEXT,                      -- encrypted at rest
  
  -- Licenses
  drivers_license_number VARCHAR(100),
  drivers_license_expiry DATE,
  tdlr_license_number VARCHAR(100),
  tdlr_license_expiry DATE,
  
  -- Employment
  hire_date DATE,
  employment_type VARCHAR(20),             -- '1099', 'W2'
  commission_structure TEXT,
  
  -- Insurance (required for 1099)
  has_insurance BOOLEAN,
  insurance_provider VARCHAR(255),
  insurance_expiry DATE,
  
  -- Status
  probation_end_date DATE,
  is_rehireable BOOLEAN,
  termination_date DATE,
  termination_reason TEXT,
  
  -- Uniform
  uniform_size VARCHAR(20),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_user ON employee_records(user_id);


-- License expiration alerts
CREATE TABLE compliance_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  alert_type VARCHAR(100),                 -- 'tdlr_expiry', 'drivers_license', 'insurance', 'drug_test'
  entity_type VARCHAR(100),                -- 'employee', 'company'
  entity_id UUID,
  
  description TEXT,
  due_date DATE,
  alert_days INT[],                        -- [60, 30, 15, 5]
  
  responsible_user_ids UUID[],
  
  status VARCHAR(50) DEFAULT 'upcoming',   -- 'upcoming', 'due', 'overdue', 'completed'
  completed_at TIMESTAMPTZ,
  completion_evidence_id UUID REFERENCES file_uploads(id),
  
  next_due_date DATE,                      -- auto-calculated after completion
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_due ON compliance_alerts(due_date);
CREATE INDEX idx_alerts_status ON compliance_alerts(status);


-- Write-ups / discipline
CREATE TABLE write_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  issued_by UUID NOT NULL REFERENCES users(id),
  template_used VARCHAR(255),
  
  violation_type VARCHAR(255),
  description TEXT,
  
  status VARCHAR(50) DEFAULT 'filed',      -- 'filed', 'acknowledged', 'resolved'
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_writeups_employee ON write_ups(employee_id);


-- Drug testing
CREATE TABLE drug_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  test_date DATE,
  test_type VARCHAR(50),                   -- 'random', 'pre_employment', 'post_incident'
  selection_method VARCHAR(50),            -- 'system_random', 'manual'
  
  result VARCHAR(50),                      -- 'pass', 'fail', 'pending', 'inconclusive'
  result_file_id UUID REFERENCES file_uploads(id),
  
  notified_employee BOOLEAN DEFAULT false,
  notified_verbal BOOLEAN DEFAULT false,
  notified_system BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- GMAIL INTEGRATION (email ↔ account linking)
-- ============================================================================

CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  email_address VARCHAR(255) NOT NULL,
  
  -- OAuth tokens (encrypted)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  
  is_connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_account_id UUID NOT NULL REFERENCES email_accounts(id),
  
  gmail_message_id VARCHAR(255) UNIQUE,
  thread_id VARCHAR(255),
  
  from_address VARCHAR(255),
  to_addresses TEXT,
  subject VARCHAR(1000),
  snippet TEXT,
  
  -- Auto-linked account
  account_id UUID REFERENCES accounts(id),
  contact_id UUID REFERENCES account_contacts(id),
  
  received_at TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT false,
  is_opened BOOLEAN,                       -- email tracking if possible
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emails_account ON email_messages(account_id);
CREATE INDEX idx_emails_gmail ON email_messages(gmail_message_id);


-- ============================================================================
-- MILEAGE REIMBURSEMENT (auto-generated from visits)
-- ============================================================================

CREATE TABLE mileage_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES users(id),
  
  report_month DATE NOT NULL,              -- first of month
  total_miles DECIMAL(8,2),
  reimbursement_rate DECIMAL(5,3),         -- IRS rate
  total_reimbursement DECIMAL(10,2),
  
  status VARCHAR(50) DEFAULT 'draft',      -- 'draft', 'submitted', 'approved'
  
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- SEED DATA: Finance Categories (Jerson's exact list)
-- ============================================================================

INSERT INTO finance_categories (name, sort_order) VALUES
  ('Charity', 1),
  ('1099 Contractor Payments', 2),
  ('Accounting', 3),
  ('Account Transfer', 4),
  ('Alarm & Security Systems', 5),
  ('Amell Agency - Liability Ins.', 6),
  ('Auction Expenses', 7),
  ('Bank Withdrawal', 8),
  ('Bank & Merchant Fees', 9),
  ('Business Income Tax', 10),
  ('Chargebacks', 11),
  ('Client Cultivation', 12),
  ('Interest / Loans / Credit Cards', 13),
  ('Damage Claims', 14),
  ('Electronic Hardware Devices', 15),
  ('Fines & Penalties', 16),
  ('Staff Food & Beverage', 17),
  ('Facility Tools and Equipment', 18),
  ('Fraud / Unauthorized Charges', 19),
  ('Fuel', 20),
  ('Junk car/ Vehicle repairs', 21),
  ('Legal', 22),
  ('Licenses & Permits', 23),
  ('Loan Repayment', 24),
  ('Marketing & Advertising', 25),
  ('Miscellaneous', 26),
  ('New Hire Screening Fee', 27),
  ('Office & Supplies', 28),
  ('Staff Reimbursements', 29),
  ('Owner Draw - Jeidy', 30),
  ('Owner Draw - Jendel', 31),
  ('Owner Draw - Jerson', 32),
  ('Owner Contribution - Jeidy', 33),
  ('Owner Contribution - Jendel', 34),
  ('Owner Contribution - Jerson', 35),
  ('Parking Fees', 36),
  ('Phone & Communications', 37),
  ('Progressive - Truck Insurance', 38),
  ('Received Loans', 39),
  ('Rent', 40),
  ('Refunds', 41),
  ('Reversal Credits for Fraud', 42),
  ('Sales Tax', 43),
  ('Savings', 44),
  ('Signage & Parking Supplies', 45),
  ('Software', 46),
  ('Staff Screening & Compliance', 47),
  ('Toll Road Fees', 48),
  ('Tow Truck Sales', 49),
  ('Towing Equipment Sales', 50),
  ('Towing & Impound Sales', 51),
  ('Towing Equipment & Supplies', 52),
  ('Travel & Conferences', 53),
  ('Unauthorized Expense', 54),
  ('Uniforms & Safety Gear', 55),
  ('Vehicle Maintenance & Repairs Unit #2', 56),
  ('Vehicle Maintenance & Repairs Unit #3', 57),
  ('Vehicle Maintenance & Repairs Unit #4', 58),
  ('Vehicle Maintenance & Repairs Unit #5', 59),
  ('Yard Facilities Maintenance', 60),
  ('VTR Fee', 61);


-- ============================================================================
-- SEED DATA: Configurable work types
-- ============================================================================

INSERT INTO configurable_lists (list_type, label, sort_order) VALUES
  ('work_type', 'Signage Install', 1),
  ('work_type', 'Signage Removal', 2),
  ('work_type', 'Custom Signage', 3),
  ('work_type', 'Visitor Stenciling', 4),
  ('work_type', 'Handicap Stenciling', 5),
  ('work_type', 'Reserved Spot Stenciling', 6),
  ('work_type', 'Paint Removal', 7),
  ('work_type', 'Flyering', 8);


-- ============================================================================
-- TABLE COUNT SUMMARY
-- ============================================================================
-- Foundation:        8 tables (users, sessions, permissions, audit, files, config_lists, events, jobs)
-- Account Mgmt:      7 tables (accounts, companies, contacts, affiliations, agreements, activities, courtesy)
-- Dispatch:          2 tables (handoffs, handoff_replies)
-- Safety:            1 table  (ctw_records)
-- Finance:          10 tables (categories, transactions, splits, cash_bags, transfers, pay_agreements, payroll_runs, payroll_lines, receivables, debts)
-- Assets/Expenses:   3 tables (assets, expense_reports, expense_lines)
-- Timeclock:         5 tables (clock_events, shifts, timesheets, corrections, time_off)
-- Later modules:    10 tables (towbook_imports, vehicle_history, work_orders, damage_claims, tow_hearings, chargebacks, dispositions, employee_records, alerts, write_ups, drug_tests)
-- Email:             2 tables (email_accounts, email_messages)
-- Mileage:           1 table  (mileage_reports)
-- TOTAL:            ~49 tables
