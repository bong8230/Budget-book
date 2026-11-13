import type { RecurringItem, RecurringStatus, RecurringSuggestion, Transaction } from '@/lib/db/types';
const normalized = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
/** Return each occurrence in the inclusive range; count limits start at the schedule's first occurrence. */
export function dueDates(item: RecurringItem, from: string, to: string): string[] {
  const start = item.start_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Invalid dates');
  const [year, month, day] = start.split('-').map(Number);
  const limit = item.end_date && item.end_date < to ? item.end_date : to;
  const dates: string[] = []; let count = 0;
  for (let i = 0; i < 200000; i++) {
    let date: Date;
    if (item.frequency === 'weekly') { date = new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 7 * i); }
    else {
      const monthly = item.frequency !== 'yearly';
      const monthIndex = month - 1 + (monthly ? i : 12 * i);
      const first = new Date(Date.UTC(year, monthIndex, 1));
      const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(monthly ? item.day_of_month : day, lastDay)));
    }
    const value = date.toISOString().slice(0, 10);
    if (value < start) continue;
    if (value > limit) break;
    count++;
    if (item.max_count != null && count > item.max_count) break;
    if (value >= from) dates.push(value);
  }
  return dates;
}
export function recurringStatus(items: RecurringItem[], transactions: Transaction[], month: string): RecurringStatus[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Expected YYYY-MM');
  const [year, m] = month.split('-').map(Number);
  const last = `${month}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2,'0')}`;
  return items.filter(item => item.active).flatMap(item => dueDates({ ...item, frequency: item.frequency ?? 'monthly', start_date: item.start_date ?? `${month}-01` }, `${month}-01`, last).map(dueDate => {
    const keyword = normalized(item.keyword);
    const nextWeek = new Date(`${dueDate}T00:00:00Z`); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    const match = transactions.find(tx => tx.recurring_item_id === item.id && tx.occurred_on === dueDate) ?? transactions.find(tx => {
      const inPeriod = item.frequency === 'weekly' ? tx.occurred_on >= dueDate && tx.occurred_on < nextWeek.toISOString().slice(0, 10) : tx.occurred_on.startsWith(`${month}-`);
      return !tx.recurring_item_id && inPeriod && tx.type === item.type && keyword.length > 0 && normalized(`${tx.memo} ${tx.merchant ?? ''}`).includes(keyword) && Math.abs(tx.amount - item.amount) <= item.amount * 0.1;
    });
    return { item, dueDate, matchedTransactionId: match?.id ?? null };
  }));
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
