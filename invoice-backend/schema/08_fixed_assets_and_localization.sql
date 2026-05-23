-- Fixed assets register (depreciation schedules — extend in app later).
-- Tax localization: journal_lines.tax_scheme / tax_rate / tax_amount feed GET /api/finance/reports/tax-register
-- and future country packs (e.g. India GSTR line maps) without schema churn.

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
