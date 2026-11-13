import { describe, expect, it } from 'vitest';
import { dueDates, recurringStatus } from '@/lib/recurring';
import type { RecurringItem, Transaction } from '@/lib/db/types';
const item = (overrides: Partial<RecurringItem> = {}) => ({ start_date:'2024-01-31', frequency:'monthly', day_of_month:31, end_date:null, max_count:null, ...overrides }) as RecurringItem;
describe('recurring due dates', () => {
  it('clamps month ends and honors the original day', () => {
    expect(dueDates(item(), '2024-01-01', '2024-04-30')).toEqual(['2024-01-31','2024-02-29','2024-03-31','2024-04-30']);
  });
  it('counts from start even when the query starts later', () => {
    expect(dueDates(item({ frequency:'weekly', start_date:'2024-01-01', max_count:4 }), '2024-01-15', '2024-02-01')).toEqual(['2024-01-15','2024-01-22']);
  });
  it('clamps leap day and respects end date', () => {
    expect(dueDates(item({ frequency:'yearly', start_date:'2024-02-29', end_date:'2026-03-01' }), '2024-01-01', '2028-12-31')).toEqual(['2024-02-29','2025-02-28','2026-02-28']);
  });
  it('reports each weekly occurrence separately', () => {
    const week = item({ id:'weekly', active:true, frequency:'weekly', start_date:'2024-01-01', keyword:'구독', amount:100, type:'expense' });
    const manual = { id:'tx', occurred_on:'2024-01-09', type:'expense', amount:100, memo:'구독', merchant:null } as Transaction;
    const statuses = recurringStatus([week], [manual], '2024-01');
    expect(statuses.map(r => r.dueDate)).toEqual(['2024-01-01','2024-01-08','2024-01-15','2024-01-22','2024-01-29']);
    expect(statuses.map(r => r.matchedTransactionId)).toEqual([null,'tx',null,null,null]);
  });
});
