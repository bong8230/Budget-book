import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, TransactionType, Transaction, PaymentMethod, Rule, RecurringItem } from '@/lib/db/types';
import { recurringStatus, recurringSuggestions } from '@/lib/recurring';
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
  return listTransactionsBetween(db, ledgerId, `${month}-01`, next);
}
export async function addTransaction(db: SupabaseClient, input: { ledger_id: string; type: TransactionType; amount: number; occurred_on: string; category_id?: string | null; payment_method_id?: string | null; merchant?: string | null; memo?: string; source?: Transaction['source']; created_by: string }) { return db.from('transactions').insert(input).select().single(); }
export async function updateTransaction(db: SupabaseClient, id: string, changes: Partial<Pick<Parameters<typeof addTransaction>[1], 'type' | 'amount' | 'occurred_on' | 'category_id' | 'payment_method_id' | 'merchant' | 'memo'>>) { return db.from('transactions').update(changes).eq('id', id).select().single(); }
export async function deleteTransaction(db: SupabaseClient, id: string) { return db.from('transactions').delete().eq('id', id); }
export async function listCategories(db: SupabaseClient, ledgerId: string) { return db.from('categories').select('*').eq('ledger_id', ledgerId).order('name'); }
export async function addCategory(db: SupabaseClient, category: Omit<Category, 'id'>) { return db.from('categories').insert(category).select().single(); }
export async function getBudget(db: SupabaseClient, ledgerId: string, month: string) { return db.from('monthly_budgets').select('*').eq('ledger_id', ledgerId).eq('month', month).maybeSingle(); }
export async function setBudget(db: SupabaseClient, ledgerId: string, month: string, amount: number) { return db.from('monthly_budgets').upsert({ ledger_id: ledgerId, month, amount }).select().single(); }
export async function listImports(db: SupabaseClient, ledgerId: string) { return db.from('imports').select('*,duplicate:transactions!imports_duplicate_ledger_fk(id,amount,occurred_on,memo)').eq('ledger_id', ledgerId).eq('status', 'pending').order('created_at', { ascending: false }); }
export async function resolveImport(db: SupabaseClient, id: string, action: 'accept' | 'ignore', values: { type?: TransactionType; amount?: number; date?: string; categoryId?: string; paymentMethodId?: string; merchant?: string; memo?: string } = {}) { return db.rpc('resolve_import', { item_id: id, action, item_type: values.type ?? null, item_amount: values.amount ?? null, item_date: values.date ?? null, item_category: values.categoryId ?? null, item_payment_method: values.paymentMethodId ?? null, item_merchant: values.merchant ?? null, item_memo: values.memo ?? '' }); }
export const createTransaction = addTransaction;
export const getMonthlyBudget = getBudget;
export const setMonthlyBudget = setBudget;
export const listPendingImports = listImports;
export async function acceptImport(db: SupabaseClient, id: string, values: Parameters<typeof resolveImport>[3] = {}) { return resolveImport(db, id, 'accept', values); }
export async function ignoreImport(db: SupabaseClient, id: string) { return resolveImport(db, id, 'ignore'); }
export async function listDeviceTokens(db: SupabaseClient, ledgerId: string) { return db.from('device_tokens').select('id,ledger_id,name,created_at,last_used_at,revoked_at').eq('ledger_id', ledgerId).order('created_at', { ascending: false }); }
export type PaymentMethodInput = Pick<PaymentMethod, 'ledger_id' | 'name' | 'kind'> & Partial<Pick<PaymentMethod, 'owner_id' | 'keywords'>>;
export type RuleInput = Pick<Rule, 'ledger_id' | 'keyword'> & { created_by: string } & Partial<Pick<Rule, 'category_id' | 'set_type' | 'payment_method_id' | 'auto_accept'>>;
export type RecurringInput = Pick<RecurringItem, 'ledger_id' | 'name' | 'type' | 'amount' | 'day_of_month' | 'keyword'> & Partial<Pick<RecurringItem, 'category_id' | 'payment_method_id' | 'active'>>;
export async function listPaymentMethods(db: SupabaseClient, ledgerId: string) { return db.from('payment_methods').select('*').eq('ledger_id', ledgerId).is('archived_at', null).order('created_at'); }
export async function addPaymentMethod(db: SupabaseClient, input: PaymentMethodInput) { return db.from('payment_methods').insert(input).select().single(); }
export async function updatePaymentMethod(db: SupabaseClient, id: string, changes: Partial<Omit<PaymentMethodInput, 'ledger_id'>>) { return db.from('payment_methods').update(changes).eq('id', id).select().single(); }
export async function archivePaymentMethod(db: SupabaseClient, id: string) { return db.from('payment_methods').update({ archived_at: new Date().toISOString() }).eq('id', id); }
export async function listRules(db: SupabaseClient, ledgerId: string) { return db.from('rules').select('*').eq('ledger_id', ledgerId).order('created_at').order('id'); }
export async function addRule(db: SupabaseClient, input: RuleInput) { return db.from('rules').insert(input).select().single(); }
export async function updateRule(db: SupabaseClient, id: string, changes: Partial<Omit<RuleInput, 'ledger_id' | 'created_by'>>) { return db.from('rules').update(changes).eq('id', id).select().single(); }
export async function deleteRule(db: SupabaseClient, id: string) { return db.from('rules').delete().eq('id', id); }
export async function previewRule(db: SupabaseClient, ledgerId: string, keyword: string) { return db.rpc('preview_rule', { target_ledger: ledgerId, search_keyword: keyword }); }
export async function listRecurring(db: SupabaseClient, ledgerId: string) { return db.from('recurring_items').select('*').eq('ledger_id', ledgerId).order('day_of_month').order('created_at'); }
export async function addRecurring(db: SupabaseClient, input: RecurringInput) { return db.from('recurring_items').insert(input).select().single(); }
export async function updateRecurring(db: SupabaseClient, id: string, changes: Partial<Omit<RecurringInput, 'ledger_id'>>) { return db.from('recurring_items').update(changes).eq('id', id).select().single(); }
export async function deleteRecurring(db: SupabaseClient, id: string) { return db.from('recurring_items').delete().eq('id', id); }
export async function mergeImport(db: SupabaseClient, importId: string, transactionId: string) { return db.rpc('merge_import', { item_id: importId, target_transaction: transactionId }); }
export async function listTransactionsRange(db: SupabaseClient, ledgerId: string, fromMonth: string, toMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(toMonth) || fromMonth > toMonth) throw new Error('Expected ordered YYYY-MM range');
  const [year, month] = toMonth.split('-').map(Number);
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return listTransactionsBetween(db, ledgerId, `${fromMonth}-01`, end);
}
async function listTransactionsBetween(db: SupabaseClient, ledgerId: string, from: string, end: string) {
  const all: Transaction[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('transactions').select('*').eq('ledger_id', ledgerId).gte('occurred_on', from).lt('occurred_on', end).order('occurred_on', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 999);
    if (error) return { data: null, error };
    all.push(...(data ?? []) as Transaction[]);
    if (!data || data.length < 1000) return { data: all, error: null };
  }
}
export type AiTransactionQuery = { from: string; to: string; type?: TransactionType | null; categoryId?: string | null; keyword?: string | null };
export async function aiQueryTransactions(db: SupabaseClient, ledgerId: string, input: AiTransactionQuery) {
  return db.rpc('ai_query_transactions', { target_ledger: ledgerId, from_date: input.from, to_date: input.to, type_filter: input.type ?? null, category_filter: input.categoryId ?? null, keyword: input.keyword ?? null }).single();
}
export async function getRecurringStatus(db: SupabaseClient, ledgerId: string, month: string) {
  const [items, transactions] = await Promise.all([listRecurring(db, ledgerId), listTransactions(db, ledgerId, month)]);
  if (items.error) throw items.error;
  if (transactions.error) throw transactions.error;
  return recurringStatus(items.data ?? [], transactions.data ?? [], month);
}
export async function suggestRecurring(db: SupabaseClient, ledgerId: string) {
  const now = new Date();
  const months = [2, 1, 0].map(offset => { const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - offset, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; });
  const [items, transactions] = await Promise.all([listRecurring(db, ledgerId), listTransactionsRange(db, ledgerId, months[0], months[2])]);
  if (items.error) throw items.error;
  if (transactions.error) throw transactions.error;
  return recurringSuggestions(transactions.data ?? [], items.data ?? [], months);
}
/** Use a server-only service client and user ID from auth.getUser(). */
export async function reserveAiBudget(db: SupabaseClient, ledgerId: string, userId: string, reserveKrw: number, capKrw: number) {
  return db.rpc('reserve_ai_budget', { target_ledger: ledgerId, target_user: userId, reserve_krw: reserveKrw, cap_krw: capKrw });
}
/** Use a server-only service client and user ID from auth.getUser(). */
export async function settleAiUsage(db: SupabaseClient, id: string, userId: string, inputTokens: number, outputTokens: number, costKrw: number) {
  return db.rpc('settle_ai_usage', { usage_id: id, target_user: userId, input_tokens: inputTokens, output_tokens: outputTokens, cost_krw: costKrw });
}
export async function getAiUsageSummary(db: SupabaseClient, ledgerId: string, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Expected YYYY-MM');
  const { data, error } = await db.rpc('ai_usage_summary', { target_ledger: ledgerId, target_month: `${month}-01` }).single();
  if (error) throw error;
  const row = data as { spent_krw: number; reserved_krw: number } | null;
  return { spentKrw: Number(row?.spent_krw ?? 0), reservedKrw: Number(row?.reserved_krw ?? 0) };
}
