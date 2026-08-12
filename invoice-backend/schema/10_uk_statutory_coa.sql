-- UK statutory chart of accounts: maps the ledger to Companies Act 2006 / SI 2008/409
-- Schedule 1 Format 1 balance sheet + P&L headings, and fills gaps (Corporation Tax,
-- PAYE/NIC, pensions, fixed assets/depreciation, VAT control, director's loan, equity,
-- cost of sales, standard admin expense categories) that the original 13-account fleet-
-- expense seed never covered. Purely additive: no existing account is renumbered or
-- removed, so existing journal_lines FKs are untouched.
-- Run after 06_seed_default_accounts.sql. Idempotent; safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='statutory_heading') THEN
    ALTER TABLE accounts ADD COLUMN statutory_heading TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='statutory_sort_order') THEN
    ALTER TABLE accounts ADD COLUMN statutory_sort_order INT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ─── Tag existing accounts into the statutory structure ─────────────────
UPDATE accounts SET statutory_heading = 'Current assets - Cash at bank and in hand' WHERE code IN ('1000', '1100') AND statutory_heading IS NULL;
UPDATE accounts SET statutory_heading = 'Current assets - Debtors' WHERE code IN ('1200', '1310') AND statutory_heading IS NULL;
UPDATE accounts SET statutory_heading = 'Creditors: amounts falling due within one year' WHERE code IN ('2000', '2110') AND statutory_heading IS NULL;
UPDATE accounts SET statutory_heading = 'Capital and reserves' WHERE code = '3000' AND statutory_heading IS NULL;
UPDATE accounts SET statutory_heading = 'Turnover' WHERE code = '4000' AND statutory_heading IS NULL;
UPDATE accounts SET statutory_heading = 'Administrative expenses' WHERE code IN ('5100', '5200', '5300', '5400', '5900') AND statutory_heading IS NULL;

-- ─── New accounts ─────────────────────────────────────────────────────────
INSERT INTO accounts (code, name, account_type, default_tax_scheme, statutory_heading, statutory_sort_order) VALUES
  -- Fixed assets
  ('1500', 'Tangible fixed assets (cost)', 'asset', NULL, 'Fixed assets - Tangible', 10),
  ('1590', 'Accumulated depreciation — tangible assets', 'asset', NULL, 'Fixed assets - Tangible', 20),

  -- VAT control (nets 1310/2110 at quarter-end when the VAT return is filed — manual journal, not automated)
  ('2120', 'VAT control account', 'liability', NULL, 'Creditors: amounts falling due within one year', 30),

  -- Corporation Tax
  ('2200', 'Corporation tax payable', 'liability', NULL, 'Creditors: amounts falling due within one year', 40),
  ('8000', 'Corporation tax', 'expense', NULL, 'Taxation', 10),

  -- Payroll
  ('2300', 'PAYE & National Insurance control account', 'liability', NULL, 'Creditors: amounts falling due within one year', 50),
  ('2310', 'Pension contributions payable', 'liability', NULL, 'Creditors: amounts falling due within one year', 60),
  ('6000', 'Staff costs — wages and salaries', 'expense', NULL, 'Administrative expenses', 10),
  ('6010', 'Staff costs — employer''s NIC', 'expense', NULL, 'Administrative expenses', 20),
  ('6020', 'Staff costs — pension contributions', 'expense', NULL, 'Administrative expenses', 30),
  ('6030', 'Directors'' remuneration', 'expense', NULL, 'Administrative expenses', 40),

  -- Director's loan
  ('2400', 'Director''s loan account', 'liability', NULL, 'Creditors: amounts falling due within one year', 70),

  -- Equity
  ('3100', 'Called up share capital', 'equity', NULL, 'Capital and reserves', 10),
  ('3200', 'Share premium account', 'equity', NULL, 'Capital and reserves', 20),

  -- Cost of sales
  ('5000', 'Cost of sales — purchases', 'expense', NULL, 'Cost of sales', 10),

  -- Administrative expenses — standard UK SME P&L categories (additive alongside the
  -- existing 5100-5900 fleet-expense accounts, which are untouched and still used by
  -- invoice auto-posting)
  ('6100', 'Rent and rates', 'expense', NULL, 'Administrative expenses', 50),
  ('6110', 'Light and heat', 'expense', NULL, 'Administrative expenses', 60),
  ('6120', 'Insurance', 'expense', NULL, 'Administrative expenses', 70),
  ('6130', 'Repairs and renewals', 'expense', NULL, 'Administrative expenses', 80),
  ('6140', 'Motor expenses', 'expense', NULL, 'Administrative expenses', 90),
  ('6150', 'Travel and subsistence', 'expense', NULL, 'Administrative expenses', 100),
  ('6160', 'Telephone and IT', 'expense', NULL, 'Administrative expenses', 110),
  ('6170', 'Printing, postage and stationery', 'expense', NULL, 'Administrative expenses', 120),
  ('6180', 'Legal and professional fees', 'expense', NULL, 'Administrative expenses', 130),
  ('6190', 'Accountancy fees', 'expense', NULL, 'Administrative expenses', 140),
  ('6200', 'Bank charges', 'expense', NULL, 'Administrative expenses', 150),
  ('6210', 'Subscriptions', 'expense', NULL, 'Administrative expenses', 160),
  ('6220', 'Depreciation', 'expense', NULL, 'Administrative expenses', 170),
  ('6900', 'Sundry/general expenses', 'expense', NULL, 'Administrative expenses', 999),

  -- Interest
  ('7000', 'Interest payable', 'expense', NULL, 'Interest payable and similar charges', 10)
ON CONFLICT (code) DO NOTHING;

-- Done. Optional: SELECT code, name, account_type, statutory_heading FROM accounts ORDER BY statutory_heading, statutory_sort_order, code;
