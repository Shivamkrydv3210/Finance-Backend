-- Month-end checklist and document attachment metadata (files in Supabase Storage or external URLs).

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
