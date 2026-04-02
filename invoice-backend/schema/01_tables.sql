-- Run in Supabase: Dashboard → SQL → New query.
-- Order: vendors → invoice_header → line items → triggers.

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
