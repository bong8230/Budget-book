import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, TransactionType } from '@/lib/db/types';
export async function listLedgers(db: SupabaseClient) { return db.from('ledgers').select('*').order('created_at'); }
export async function getMyLedger(db: SupabaseClient) { return db.from('ledgers').select('*').order('created_at').limit(1).maybeSingle(); }
export async function createLedger(db: SupabaseClient, name: string) { return db.rpc('create_ledger', { ledger_name: name }); }
export async function createInvite(db: SupabaseClient, ledgerId: string) { return db.rpc('create_invite', { target_ledger: ledgerId }); }
export async function joinLedger(db: SupabaseClient, code: string) { return db.rpc('join_ledger', { invite_code: code }); }
export async function listMembers(db: SupabaseClient, ledgerId: string) { return db.from('ledger_members').select('*').eq('ledger_id', ledgerId); }
export async function setDisplayName(db: SupabaseClient, ledgerId: string, name: string) { return db.rpc('set_display_name', { target_ledger: ledgerId, name }); }
export async function listTransactions(db: SupabaseClient, ledgerId: string, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Expected YYYY-MM');
  const [year, m] = month.split('-').map(Number);
  const next = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`;
  return db.from('transactions').select('*').eq('ledger_id', ledgerId).gte('occurred_on', `${month}-01`).lt('occurred_on', next).order('occurred_on', { ascending: false });
}
export async function addTransaction(db: SupabaseClient, input: { ledger_id: string; type: TransactionType; amount: number; occurred_on: string; category_id?: string | null; memo?: string; created_by: string }) { return db.from('transactions').insert(input).select().single(); }
export async function updateTransaction(db: SupabaseClient, id: string, changes: Partial<Pick<Parameters<typeof addTransaction>[1], 'type' | 'amount' | 'occurred_on' | 'category_id' | 'memo'>>) { return db.from('transactions').update(changes).eq('id', id).select().single(); }
export async function deleteTransaction(db: SupabaseClient, id: string) { return db.from('transactions').delete().eq('id', id); }
export async function listCategories(db: SupabaseClient, ledgerId: string) { return db.from('categories').select('*').eq('ledger_id', ledgerId).order('name'); }
export async function addCategory(db: SupabaseClient, category: Omit<Category, 'id'>) { return db.from('categories').insert(category).select().single(); }
export async function getBudget(db: SupabaseClient, ledgerId: string, month: string) { return db.from('monthly_budgets').select('*').eq('ledger_id', ledgerId).eq('month', month).maybeSingle(); }
export async function setBudget(db: SupabaseClient, ledgerId: string, month: string, amount: number) { return db.from('monthly_budgets').upsert({ ledger_id: ledgerId, month, amount }).select().single(); }
export async function listImports(db: SupabaseClient, ledgerId: string) { return db.from('imports').select('*').eq('ledger_id', ledgerId).eq('status', 'pending').order('created_at', { ascending: false }); }
export async function resolveImport(db: SupabaseClient, id: string, action: 'accept' | 'ignore', values: { type?: TransactionType; amount?: number; date?: string; categoryId?: string; memo?: string } = {}) { return db.rpc('resolve_import', { item_id: id, action, item_type: values.type ?? null, item_amount: values.amount ?? null, item_date: values.date ?? null, item_category: values.categoryId ?? null, item_memo: values.memo ?? '' }); }
export const createTransaction = addTransaction;
export const getMonthlyBudget = getBudget;
export const setMonthlyBudget = setBudget;
export const listPendingImports = listImports;
export async function acceptImport(db: SupabaseClient, id: string, values: Parameters<typeof resolveImport>[3] = {}) { return resolveImport(db, id, 'accept', values); }
export async function ignoreImport(db: SupabaseClient, id: string) { return resolveImport(db, id, 'ignore'); }
export async function listDeviceTokens(db: SupabaseClient, ledgerId: string) { return db.from('device_tokens').select('id,ledger_id,name,created_at,last_used_at,revoked_at').eq('ledger_id', ledgerId).order('created_at', { ascending: false }); }
