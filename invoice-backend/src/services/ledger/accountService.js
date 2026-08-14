import { supabase } from '../../db.js';
import { findExpenseRule as getExpenseRule } from '../../knowledge/uk-tax/expenseRules.js';

// Chart of accounts changes rarely (admin-managed, ~43 rows) but every invoice post did
// 3 separate DB round-trips for it. Cache the full table for a short TTL instead —
// short enough that an admin edit shows up within minutes, long enough to remove the
// N+1 pattern from the hot path.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { all: [], byCode: new Map(), byId: new Map(), expiresAt: 0 };

async function getAccountsCache() {
  if (Date.now() < cache.expiresAt && cache.all.length) return cache;
  const { data, error } = await supabase.from('accounts').select('*').order('code');
  if (error) throw new Error(error.message);
  const all = data || [];
  cache = {
    all,
    byCode: new Map(all.map((a) => [a.code, a])),
    byId: new Map(all.map((a) => [a.account_id, a])),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return cache;
}

/** Call after any direct write to `accounts` so the next read isn't stale for up to CACHE_TTL_MS. */
export function invalidateAccountsCache() {
  cache = { all: [], byCode: new Map(), byId: new Map(), expiresAt: 0 };
}

/** Bulk lookup by account_id — used to resolve account codes for arbitrary journal lines. */
export async function getAccountsByIds(ids) {
  const { byId } = await getAccountsCache();
  const result = {};
  for (const id of ids) result[id] = byId.get(id) || null;
  return result;
}

export async function listAccounts(activeOnly = true) {
  const { all } = await getAccountsCache();
  return activeOnly ? all.filter((a) => a.is_active) : all;
}

export async function getAccountByCode(code) {
  const { byCode } = await getAccountsCache();
  return byCode.get(code) || null;
}

/** Bulk lookup — one cache load (at most one DB round-trip) regardless of how many codes are requested. */
export async function getAccountsByCodes(codes) {
  const { byCode } = await getAccountsCache();
  const result = {};
  for (const code of codes) result[code] = byCode.get(code) || null;
  return result;
}

// Legacy 5-bucket category (invoice_header.category, CHECK-constrained) → the
// knowledge base's expense_rules key. The GL codes themselves live in
// src/knowledge/uk-tax/expenseRules.js — this is just the name mapping between
// the old taxonomy and the new one, kept here so the CHECK constraint's exact
// values never have to change.
const CATEGORY_TO_EXPENSE_RULE_KEY = {
  fuel: 'fuel',
  maintenance: 'fleet_maintenance',
  repair: 'fleet_repair',
  parts: 'fleet_parts',
  other: 'other',
};

export function expenseAccountCodeForCategory(category) {
  const k = String(category || 'other').toLowerCase();
  const ruleKey = CATEGORY_TO_EXPENSE_RULE_KEY[k] || 'other';
  return getExpenseRule(ruleKey)?.gl_account_code || getExpenseRule('other').gl_account_code;
}
