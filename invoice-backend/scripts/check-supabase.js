/**
 * Quick Supabase connectivity check. Run from repo root: node invoice-backend/scripts/check-supabase.js
 * Or from invoice-backend: node scripts/check-supabase.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('Checking Supabase at', SUPABASE_URL.replace(/\/\/.*@/, '//***@'));
  try {
    const { data: vendors, error: e1 } = await supabase.from('vendors').select('id').limit(1);
    if (e1) {
      console.error('Vendors table:', e1.message);
      return false;
    }
    console.log('  vendors: OK');

    const { data: headers, error: e2 } = await supabase.from('invoice_header').select('invoice_id').limit(1);
    if (e2) {
      console.error('  invoice_header:', e2.message);
      return false;
    }
    console.log('  invoice_header: OK');

    const { count, error: e3 } = await supabase.from('invoice_header').select('*', { count: 'exact', head: true });
    if (e3) {
      console.error('  count:', e3.message);
      return false;
    }
    console.log('  Total invoice_header rows:', count ?? 0);
    console.log('\nSupabase is working.');
    return true;
  } catch (err) {
    console.error('Error:', err.message);
    return false;
  }
}

check().then((ok) => process.exit(ok ? 0 : 1));
