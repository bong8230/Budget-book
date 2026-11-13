import type { RecurringItem, RecurringStatus, RecurringSuggestion, Transaction } from '@/lib/db/types';
const normalized = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function recurringStatus(items: RecurringItem[], transactions: Transaction[], month: string): RecurringStatus[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Expected YYYY-MM');
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return items.filter(item => item.active).map(item => {
    const keyword = normalized(item.keyword);
    const match = transactions.find(tx => tx.occurred_on.startsWith(`${month}-`) && tx.type === item.type && keyword.length > 0 && normalized(`${tx.memo} ${tx.merchant ?? ''}`).includes(keyword) && Math.abs(tx.amount - item.amount) <= item.amount * 0.1);
    return { item, dueDate: `${month}-${String(Math.min(item.day_of_month, lastDay)).padStart(2, '0')}`, matchedTransactionId: match?.id ?? null };
  });
}
export function recurringSuggestions(transactions: Transaction[], items: RecurringItem[], months: string[]): RecurringSuggestion[] {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = normalized(tx.merchant ?? '');
    if (tx.type !== 'expense' || !key || !months.includes(tx.occurred_on.slice(0, 7))) continue;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }
  const existing = new Set(items.map(item => normalized(item.keyword)));
  const out: RecurringSuggestion[] = [];
  for (const [key, values] of groups) {
    if (existing.has(key)) continue;
    const sorted = values.toSorted((a, b) => a.amount - b.amount);
    let best: Transaction[] = [];
    for (const center of sorted) {
      const cluster = sorted.filter(v => Math.abs(v.amount - center.amount) <= center.amount * 0.1);
      if (new Set(cluster.map(v => v.occurred_on.slice(0, 7))).size > new Set(best.map(v => v.occurred_on.slice(0, 7))).size) best = cluster;
    }
    const count = new Set(best.map(v => v.occurred_on.slice(0, 7))).size;
    if (count >= 2) out.push({ merchant: best[0].merchant!, keyword: key, amount: best[Math.floor(best.length / 2)].amount, months: count });
  }
  return out;
}
