-- UK invoice accuracy: vendor identifiers, invoice validation state, per-VAT-rate breakdown.
-- Run after 06_seed_default_accounts.sql. Idempotent; safe to re-run.

-- ─── Vendors: UK identifiers ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='vat_number') THEN
    ALTER TABLE vendors ADD COLUMN vat_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='company_registration_number') THEN
    ALTER TABLE vendors ADD COLUMN company_registration_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='sort_code') THEN
    ALTER TABLE vendors ADD COLUMN sort_code VARCHAR(8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='account_number_last4') THEN
    ALTER TABLE vendors ADD COLUMN account_number_last4 VARCHAR(4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='address_line1') THEN
    ALTER TABLE vendors ADD COLUMN address_line1 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='address_line2') THEN
    ALTER TABLE vendors ADD COLUMN address_line2 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='town') THEN
    ALTER TABLE vendors ADD COLUMN town TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='county') THEN
    ALTER TABLE vendors ADD COLUMN county TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='postcode') THEN
    ALTER TABLE vendors ADD COLUMN postcode VARCHAR(10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='vat_number_valid') THEN
    ALTER TABLE vendors ADD COLUMN vat_number_valid BOOLEAN;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_vat_number ON vendors (vat_number);
CREATE INDEX IF NOT EXISTS idx_vendors_crn ON vendors (company_registration_number);

-- ─── invoice_header: extraction/validation state ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_header' AND column_name='extraction_confidence') THEN
    ALTER TABLE invoice_header ADD COLUMN extraction_confidence NUMERIC(4,3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_header' AND column_name='validation_status') THEN
    ALTER TABLE invoice_header ADD COLUMN validation_status VARCHAR(20) NOT NULL DEFAULT 'validated'
      CHECK (validation_status IN ('validated', 'pending_review', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_header' AND column_name='validation_flags') THEN
    ALTER TABLE invoice_header ADD COLUMN validation_flags JSONB NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_header' AND column_name='content_hash') THEN
    ALTER TABLE invoice_header ADD COLUMN content_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_header' AND column_name='vat_number') THEN
    ALTER TABLE invoice_header ADD COLUMN vat_number TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_header_content_hash ON invoice_header (content_hash);
CREATE INDEX IF NOT EXISTS idx_invoice_header_validation_status ON invoice_header (validation_status);

-- ─── Per-VAT-rate breakdown (standard/reduced/zero/exempt) ──────────────
CREATE TABLE IF NOT EXISTS invoice_vat_lines (
  vat_line_id          BIGSERIAL PRIMARY KEY,
  invoice_id           BIGINT NOT NULL REFERENCES invoice_header(invoice_id) ON DELETE CASCADE,
  rate_type            VARCHAR(16) NOT NULL
                        CHECK (rate_type IN ('standard', 'reduced', 'zero', 'exempt', 'non_standard')),
  rate_pct             NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_vat_amount  NUMERIC(14,2),
  is_valid             BOOLEAN NOT NULL DEFAULT TRUE,
  variance             NUMERIC(14,2) DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_vat_lines_invoice ON invoice_vat_lines (invoice_id);

-- Done. Optional: SELECT * FROM invoice_vat_lines; SELECT vat_number, validation_status FROM invoice_header LIMIT 20;
