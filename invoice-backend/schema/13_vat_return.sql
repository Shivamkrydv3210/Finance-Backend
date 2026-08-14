-- UK VAT Return (Boxes 1–9): a computed, storable return with a line-level audit trail.
-- Every box total keeps the journal lines that produced it, so a filed figure can be
-- drilled back to source — see src/services/reports/vatReturnService.js.
-- Run after 12_uk_tax_kb.sql. Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS vat_returns (
  vat_return_id  BIGSERIAL PRIMARY KEY,
  period_from    DATE NOT NULL,
  period_to      DATE NOT NULL,
  box_1          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_2          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_3          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_4          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_5          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_6          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_7          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_8          NUMERIC(14,2) NOT NULL DEFAULT 0,
  box_9          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'finalised', 'submitted')),
  -- sha256 of the canonical box figures: recomputing the same period must reproduce
  -- this hash, which is what makes a filed return provable after the fact.
  content_hash   TEXT,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalised_at   TIMESTAMPTZ,
  notes          TEXT,
  UNIQUE (period_from, period_to)
);

CREATE INDEX IF NOT EXISTS idx_vat_returns_period ON vat_returns (period_from, period_to);

CREATE TABLE IF NOT EXISTS vat_return_lines (
  vat_return_line_id BIGSERIAL PRIMARY KEY,
  vat_return_id      BIGINT NOT NULL REFERENCES vat_returns(vat_return_id) ON DELETE CASCADE,
  box                SMALLINT NOT NULL CHECK (box >= 1 AND box <= 9),
  journal_line_id    BIGINT REFERENCES journal_lines(journal_line_id) ON DELETE SET NULL,
  journal_entry_id   BIGINT REFERENCES journal_entries(journal_entry_id) ON DELETE SET NULL,
  account_code       VARCHAR(32),
  tax_scheme         VARCHAR(64),
  amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  entry_date         DATE,
  description        TEXT
);

CREATE INDEX IF NOT EXISTS idx_vat_return_lines_return ON vat_return_lines (vat_return_id, box);
CREATE INDEX IF NOT EXISTS idx_vat_return_lines_journal ON vat_return_lines (journal_line_id);

-- Done. Optional: SELECT period_from, period_to, box_5, content_hash FROM vat_returns ORDER BY period_from;
