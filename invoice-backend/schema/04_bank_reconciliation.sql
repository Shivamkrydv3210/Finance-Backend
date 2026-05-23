-- Bank accounts, imported transactions, reconciliation links.

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
