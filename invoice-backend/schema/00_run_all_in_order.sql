-- =============================================================================
-- Invoice backend — apply ALL schema in one go (Supabase SQL Editor: paste & Run)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING
-- Order: 01 → 02 → 03 → 04 → 05 → 06 → 08
-- =============================================================================

-- ─── 01_tables.sql ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  vendor_name TEXT NOT NULL UNIQUE,
  vendor_email TEXT,
  vendor_phone TEXT,
  vendor_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(vendor_name);

CREATE TABLE IF NOT EXISTS invoice_header (
  invoice_id     BIGSERIAL PRIMARY KEY,
  vendor_id      BIGINT REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name    VARCHAR(255),
  invoice_number VARCHAR(100) UNIQUE,
  invoice_date   DATE,
  due_date       DATE,
  category       VARCHAR(50) DEFAULT 'other'
                 CHECK (category IN ('maintenance','fuel','parts','repair','other')),
  currency       VARCHAR(3)    DEFAULT 'INR',
  subtotal       DECIMAL(14,2) DEFAULT 0,
  tax_rate       DECIMAL(5,2)  DEFAULT 0,
  tax_amount     DECIMAL(14,2) DEFAULT 0,
  total_amount   DECIMAL(14,2) DEFAULT 0,
  payment_mode   VARCHAR(50),
  invoice_type   VARCHAR(50)   DEFAULT 'Tax Invoice',
  notes          TEXT,
  file_url       TEXT,
  source         VARCHAR(50)   DEFAULT 'manual',
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  line_item_id    BIGSERIAL PRIMARY KEY,
  invoice_id      BIGINT NOT NULL REFERENCES invoice_header(invoice_id) ON DELETE CASCADE,
  line_number     INT           DEFAULT 1,
  description     VARCHAR(500),
  sub_expenditure VARCHAR(100),
  quantity        DECIMAL(10,2) DEFAULT 1,
  unit_price      DECIMAL(14,2) DEFAULT 0,
  line_amount     DECIMAL(14,2) DEFAULT 0,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_header_vendor   ON invoice_header(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inv_header_date     ON invoice_header(invoice_date);
CREATE INDEX IF NOT EXISTS idx_inv_header_category ON invoice_header(category);
CREATE INDEX IF NOT EXISTS idx_inv_header_number   ON invoice_header(invoice_number);
CREATE INDEX IF NOT EXISTS idx_line_items_inv_id   ON invoice_line_items(invoice_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_header_updated ON invoice_header;
CREATE TRIGGER trg_invoice_header_updated
  BEFORE UPDATE ON invoice_header
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 02_run_invoice_query.sql ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_invoice_query(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  normalized text;
BEGIN
  normalized := lower(trim(sql_query));

  IF NOT (normalized LIKE 'select%' OR normalized LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF lower(sql_query) ~ '\y(insert|update|delete|drop|alter|create|truncate|execute|pg_read|pg_write)\y' THEN
    RAISE EXCEPTION 'Query contains disallowed operation';
  END IF;

  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql_query || ') t'
  INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION run_invoice_query(text) TO service_role;
GRANT EXECUTE ON FUNCTION run_invoice_query(text) TO anon;

-- ─── 03_ledger_core.sql ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_periods (
  period_id     BIGSERIAL PRIMARY KEY,
  period_year   INT NOT NULL,
  period_month  INT NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'soft_closed', 'locked')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_dates ON fiscal_periods (start_date, end_date);

CREATE TABLE IF NOT EXISTS accounts (
  account_id     BIGSERIAL PRIMARY KEY,
  code           VARCHAR(32) NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  account_type   VARCHAR(20) NOT NULL
                 CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id      BIGINT REFERENCES accounts(account_id) ON DELETE SET NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  default_tax_scheme VARCHAR(64),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts (account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts (parent_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  journal_entry_id BIGSERIAL PRIMARY KEY,
  entry_date       DATE NOT NULL,
  description      TEXT,
  source_type      VARCHAR(32) NOT NULL DEFAULT 'manual'
                   CHECK (source_type IN ('manual', 'invoice', 'bank', 'system', 'reconciliation')),
  source_ref       TEXT,
  reference        TEXT,
  period_id        BIGINT NOT NULL REFERENCES fiscal_periods(period_id),
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'posted', 'void')),
  approval_status  VARCHAR(20) NOT NULL DEFAULT 'approved'
                   CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  created_by       TEXT,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  posted_at        TIMESTAMPTZ,
  void_reason      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_type, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_period ON journal_entries (period_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries (status);

CREATE TABLE IF NOT EXISTS journal_lines (
  journal_line_id  BIGSERIAL PRIMARY KEY,
  journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(journal_entry_id) ON DELETE CASCADE,
  line_no          INT NOT NULL,
  account_id       BIGINT NOT NULL REFERENCES accounts(account_id),
  debit            NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit           NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description      TEXT,
  dimensions       JSONB DEFAULT '{}',
  tax_scheme       VARCHAR(64),
  tax_rate         NUMERIC(10,4),
  tax_amount       NUMERIC(18,4),
  party_type       VARCHAR(32),
  party_id         BIGINT,
  currency_code    VARCHAR(3) DEFAULT 'INR',
  UNIQUE (journal_entry_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines (account_id);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id BIGSERIAL PRIMARY KEY,
  entity_type    VARCHAR(64) NOT NULL,
  entity_id      TEXT NOT NULL,
  action         VARCHAR(64) NOT NULL,
  payload        JSONB DEFAULT '{}',
  actor          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events (created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_header' AND column_name = 'journal_entry_id'
  ) THEN
    ALTER TABLE invoice_header ADD COLUMN journal_entry_id BIGINT REFERENCES journal_entries(journal_entry_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_header' AND column_name = 'ledger_posted_at'
  ) THEN
    ALTER TABLE invoice_header ADD COLUMN ledger_posted_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_header' AND column_name = 'posting_error'
  ) THEN
    ALTER TABLE invoice_header ADD COLUMN posting_error TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_header_journal ON invoice_header (journal_entry_id);

-- ─── 04_bank_reconciliation.sql ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  bank_account_id BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  currency_code   VARCHAR(3) NOT NULL DEFAULT 'INR',
  gl_account_id   BIGINT NOT NULL REFERENCES accounts(account_id),
  last_four       VARCHAR(4),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_import_batches (
  import_batch_id BIGSERIAL PRIMARY KEY,
  bank_account_id BIGINT NOT NULL REFERENCES bank_accounts(bank_account_id) ON DELETE CASCADE,
  source_filename TEXT,
  imported_at     TIMESTAMPTZ DEFAULT NOW(),
  row_count       INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  bank_txn_id      BIGSERIAL PRIMARY KEY,
  bank_account_id  BIGINT NOT NULL REFERENCES bank_accounts(bank_account_id) ON DELETE CASCADE,
  import_batch_id  BIGINT REFERENCES bank_import_batches(import_batch_id) ON DELETE SET NULL,
  txn_date         DATE NOT NULL,
  amount           NUMERIC(18,4) NOT NULL,
  description      TEXT,
  reference        TEXT,
  balance_after    NUMERIC(18,4),
  raw_row          JSONB,
  reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'unmatched'
    CHECK (reconciliation_status IN ('unmatched', 'suggested', 'matched', 'ignored')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_txn_account_date ON bank_transactions (bank_account_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_bank_txn_status ON bank_transactions (reconciliation_status);

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  match_id         BIGSERIAL PRIMARY KEY,
  bank_txn_id      BIGINT NOT NULL REFERENCES bank_transactions(bank_txn_id) ON DELETE CASCADE,
  journal_entry_id BIGINT REFERENCES journal_entries(journal_entry_id) ON DELETE SET NULL,
  journal_line_id  BIGINT REFERENCES journal_lines(journal_line_id) ON DELETE SET NULL,
  match_type       VARCHAR(32) NOT NULL DEFAULT 'manual'
    CHECK (match_type IN ('manual', 'rule', 'suggested')),
  confidence       NUMERIC(5,2),
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bank_txn_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_match_journal ON reconciliation_matches (journal_entry_id);

-- ─── 05_close_workflow.sql ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS month_end_tasks (
  task_id     BIGSERIAL PRIMARY KEY,
  period_id   BIGINT NOT NULL REFERENCES fiscal_periods(period_id) ON DELETE CASCADE,
  task_key    VARCHAR(64) NOT NULL,
  title       TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  is_done     BOOLEAN NOT NULL DEFAULT FALSE,
  done_at     TIMESTAMPTZ,
  done_by     TEXT,
  notes       TEXT,
  UNIQUE (period_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_month_end_period ON month_end_tasks (period_id);

CREATE TABLE IF NOT EXISTS document_attachments (
  attachment_id BIGSERIAL PRIMARY KEY,
  entity_type   VARCHAR(64) NOT NULL,
  entity_id     TEXT NOT NULL,
  storage_path  TEXT,
  public_url    TEXT,
  file_name     TEXT,
  mime_type     TEXT,
  uploaded_by   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_attach_entity ON document_attachments (entity_type, entity_id);

-- ─── 06_seed_default_accounts.sql ─────────────────────────────────────────
INSERT INTO accounts (code, name, account_type, default_tax_scheme) VALUES
  ('1000', 'Cash', 'asset', NULL),
  ('1100', 'Bank — primary', 'asset', NULL),
  ('1200', 'Accounts receivable', 'asset', NULL),
  ('1310', 'VAT / GST input recoverable', 'asset', 'standard_vat_input'),
  ('2000', 'Accounts payable', 'liability', NULL),
  ('2110', 'VAT / GST output payable', 'liability', 'standard_vat_output'),
  ('3000', 'Retained earnings', 'equity', NULL),
  ('4000', 'Revenue — general', 'revenue', NULL),
  ('5100', 'Expense — fuel', 'expense', NULL),
  ('5200', 'Expense — maintenance', 'expense', NULL),
  ('5300', 'Expense — repair', 'expense', NULL),
  ('5400', 'Expense — parts', 'expense', NULL),
  ('5900', 'Expense — other', 'expense', NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO fiscal_periods (period_year, period_month, start_date, end_date, status)
VALUES (
  EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  EXTRACT(MONTH FROM CURRENT_DATE)::INT,
  DATE_TRUNC('month', CURRENT_DATE)::DATE,
  (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
  'open'
)
ON CONFLICT (period_year, period_month) DO NOTHING;

-- ─── 08_fixed_assets_and_localization.sql ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  asset_id              BIGSERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  acquisition_date      DATE NOT NULL,
  cost                  NUMERIC(18,4) NOT NULL,
  salvage_value         NUMERIC(18,4) DEFAULT 0,
  depreciation_method   VARCHAR(32) NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'declining_balance')),
  useful_life_months    INT,
  gl_asset_account_id   BIGINT REFERENCES accounts(account_id),
  gl_accum_dep_account_id BIGINT REFERENCES accounts(account_id),
  gl_dep_expense_account_id BIGINT REFERENCES accounts(account_id),
  tax_scheme            VARCHAR(64),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_acq ON fixed_assets (acquisition_date);

-- =============================================================================
-- Done. Optional: SELECT * FROM accounts ORDER BY code; SELECT * FROM fiscal_periods;
-- =============================================================================
