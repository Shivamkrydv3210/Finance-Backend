-- UK Tax Knowledge Base wiring: an "Irrecoverable VAT" GL account (blocked input VAT
-- is a cost, not a recoverable asset — see src/knowledge/uk-tax/expenseRules.js),
-- a richer expense_category column for VAT-recovery/CT-deductibility classification,
-- and GBP as the default currency for new records (existing INR rows are untouched).
-- Run after 11_journal_controls.sql. Idempotent; safe to re-run.

INSERT INTO accounts (code, name, account_type, default_tax_scheme, statutory_heading, statutory_sort_order) VALUES
  ('6250', 'Irrecoverable VAT', 'expense', NULL, 'Administrative expenses', 180)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_header' AND column_name='expense_category') THEN
    ALTER TABLE invoice_header ADD COLUMN expense_category TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_header_expense_category ON invoice_header (expense_category);

ALTER TABLE invoice_header ALTER COLUMN currency SET DEFAULT 'GBP';
ALTER TABLE journal_lines ALTER COLUMN currency_code SET DEFAULT 'GBP';

-- Done.
