import type { Transaction } from '@/lib/db/types';
type Row = Pick<Transaction, 'type' | 'amount' | 'occurred_on' | 'category_id'>;
export function monthlyTotals(rows: Row[], months: string[]) {
  return months.map(month => ({ month, income: rows.filter(r => r.occurred_on.startsWith(`${month}-`) && r.type === 'income').reduce((s, r) => s + r.amount, 0), expense: rows.filter(r => r.occurred_on.startsWith(`${month}-`) && r.type === 'expense').reduce((s, r) => s + r.amount, 0) }));
}
export function categoryBreakdown(rows: Row[], month: string) {
  const totals = new Map<string | null, number>();
  rows.filter(r => r.type === 'expense' && r.occurred_on.startsWith(`${month}-`)).forEach(r => totals.set(r.category_id, (totals.get(r.category_id) ?? 0) + r.amount));
  const total = [...totals.values()].reduce((s, n) => s + n, 0);
  return [...totals].map(([categoryId, amount]) => ({ categoryId, amount, percentage: total ? amount / total * 100 : 0 })).sort((a, b) => b.amount - a.amount);
}
export function categoryChange(rows: Row[], currentMonth: string, previousMonth: string) {
  const current = categoryBreakdown(rows, currentMonth), previous = categoryBreakdown(rows, previousMonth);
  return [...new Set([...current.map(x => x.categoryId), ...previous.map(x => x.categoryId)])].map(categoryId => {
    const amount = current.find(x => x.categoryId === categoryId)?.amount ?? 0;
    const previousAmount = previous.find(x => x.categoryId === categoryId)?.amount ?? 0;
    return { categoryId, amount, previousAmount, change: amount - previousAmount };
  });
}
