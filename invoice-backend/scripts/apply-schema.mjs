#!/usr/bin/env node
/**
 * Applies schema/00_run_all_in_order.sql using Postgres (not the Supabase REST API).
 *
 * Add to repo-root .env:
 *   DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[YOUR_DB_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
 * (Supabase Dashboard → Project Settings → Database → Connection string → URI. Use Session mode if needed.)
 *
 * Then: cd invoice-backend && npm run db:apply-schema
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const url = process.env.DATABASE_URL?.trim();
const sqlPath = path.join(__dirname, '../schema/00_run_all_in_order.sql');

if (!url) {
  console.error(`
Missing DATABASE_URL in .env.

Option A — Supabase SQL Editor (no extra env):
  1. Open: https://supabase.com/dashboard/project/_/sql/new
  2. Paste the full contents of: invoice-backend/schema/00_run_all_in_order.sql
  3. Click Run

Option B — CLI from this machine:
  1. Copy Connection string (URI) from Supabase → Settings → Database
  2. Add DATABASE_URL="..." to your repo-root .env
  3. Run: npm run db:apply-schema
`);
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.error('Schema file not found:', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const db = postgres(url, { max: 1, ssl: 'require' });

try {
  await db.unsafe(sql);
  console.log('Schema applied successfully.');
} catch (e) {
  console.error('Apply failed:', e.message);
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
