-- Journal controls: reversal linkage (Companies Act 2006 s.386-388 record-keeping —
-- corrections must be a new, linked, auditable entry, never an edit/delete of a posted
-- one) and a 'reversal' source_type so reversing entries are distinguishable from
-- ordinary manual journals.
-- Run after 10_uk_statutory_coa.sql. Idempotent; safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='voided_at') THEN
    ALTER TABLE journal_entries ADD COLUMN voided_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='reversed_by_journal_entry_id') THEN
    ALTER TABLE journal_entries ADD COLUMN reversed_by_journal_entry_id BIGINT REFERENCES journal_entries(journal_entry_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='reverses_journal_entry_id') THEN
    ALTER TABLE journal_entries ADD COLUMN reverses_journal_entry_id BIGINT REFERENCES journal_entries(journal_entry_id);
  END IF;
END $$;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'journal_entries' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%source_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE journal_entries DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN ('manual', 'invoice', 'bank', 'system', 'reconciliation', 'reversal'));

CREATE INDEX IF NOT EXISTS idx_journal_entries_reverses ON journal_entries (reverses_journal_entry_id);

-- Done.
