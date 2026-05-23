-- Default chart of accounts + fiscal period for current month (idempotent inserts).
-- Run after 03_ledger_core.sql.

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

-- Seed current calendar month period if missing
INSERT INTO fiscal_periods (period_year, period_month, start_date, end_date, status)
VALUES (
  EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  EXTRACT(MONTH FROM CURRENT_DATE)::INT,
  DATE_TRUNC('month', CURRENT_DATE)::DATE,
  (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
  'open'
)
ON CONFLICT (period_year, period_month) DO NOTHING;
