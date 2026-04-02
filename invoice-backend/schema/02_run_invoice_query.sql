-- Natural-language query API uses supabase.rpc('run_invoice_query', { sql_query }).
-- Run after 01_tables.sql in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION run_invoice_query(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  normalized text;
BEGIN
  normalized := lower(trim(sql_query));

  IF NOT (normalized LIKE 'select%' OR normalized LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF lower(sql_query) ~ '\y(insert|update|delete|drop|alter|create|truncate|execute|pg_read|pg_write)\y' THEN
    RAISE EXCEPTION 'Query contains disallowed operation';
  END IF;

  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql_query || ') t'
  INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION run_invoice_query(text) TO service_role;
GRANT EXECUTE ON FUNCTION run_invoice_query(text) TO anon;
