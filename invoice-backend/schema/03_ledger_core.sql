-- Ledger: fiscal periods, chart of accounts, journals, audit trail.
-- Run after 01_tables.sql, 02_run_invoice_query.sql.

-- ─── Fiscal periods ─────────────────────────────────────────────────────
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

-- ─── Chart of accounts ───────────────────────────────────────────────────
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

-- ─── Journal entries ─────────────────────────────────────────────────────
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

-- ─── Journal lines (tax / localization metadata on line) ────────────────
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

-- ─── Immutable audit log ─────────────────────────────────────────────────
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

-- ─── Invoice ↔ ledger link ───────────────────────────────────────────────
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

-- Partial unique: only one posted journal per invoice source_ref is enforced in app; DB allows draft duplicates — use source_ref = invoice_id::text
