import { describe, expect, it } from 'vitest';
import { matchPaymentMethod, matchRule, classifyTransfer } from '@/lib/rules/match';
import { recurringStatus, recurringSuggestions } from '@/lib/recurring';
import { monthlyTotals, categoryBreakdown, categoryChange } from '@/lib/report';
import type { PaymentMethod, RecurringItem, Rule, Transaction } from '@/lib/db/types';

const tx = (id: string, date: string, amount: number, type: Transaction['type'] = 'expense'): Transaction => ({ id, ledger_id:'l', type, amount, occurred_on:date, category_id:'c', payment_method_id:null, merchant:'넷플릭스', memo:'', created_by:'u', source:'manual', created_at:'', updated_at:'' });
describe('phase 2 calculations', () => {
  it('matches earliest rule and excludes archived payment methods', () => {
    const rules = [{id:'b',created_at:'2026-02',keyword:'카페'}, {id:'a',created_at:'2026-01',keyword:'카페'}] as Rule[];
    expect(matchRule('카페 결제',null,rules)?.id).toBe('a');
    const methods = [{id:'old', keywords:['카드'], archived_at:'x'}, {id:'new',keywords:['카드'],archived_at:null}] as PaymentMethod[];
    expect(matchPaymentMethod('카드 결제',methods)?.id).toBe('new');
    expect(classifyTransfer('자동이체 카드대금','expense')).toBe('transfer');
  });
  it('clamps due day and matches a recurring expense within tolerance', () => {
    const items = [{id:'r',active:true,day_of_month:31,keyword:'넷플릭스',amount:1000,type:'expense'}] as RecurringItem[];
    expect(recurringStatus(items,[tx('a','2026-02-10',1100)],'2026-02')[0]).toMatchObject({dueDate:'2026-02-28',matchedTransactionId:'a'});
    expect(recurringStatus(items,[tx('a','2026-02-10',1101)],'2026-02')[0].matchedTransactionId).toBeNull();
  });
  it('suggests only merchants with matching expenses across two months', () => {
    const rows = [tx('a','2026-09-01',1000),tx('b','2026-10-01',1050),tx('c','2026-11-01',9000)];
    expect(recurringSuggestions(rows,[],['2026-09','2026-10','2026-11'])[0].months).toBe(2);
    expect(recurringSuggestions(rows,[{keyword:'넷플릭스'} as RecurringItem],['2026-09','2026-10','2026-11'])).toEqual([]);
  });
  it('excludes transfers from report totals and category figures', () => {
    const rows = [tx('a','2026-11-01',1000),tx('b','2026-11-01',500,'transfer'),tx('c','2026-10-01',400)];
    expect(monthlyTotals(rows,['2026-11'])[0]).toEqual({month:'2026-11',income:0,expense:1000});
    expect(categoryBreakdown(rows,'2026-11')[0].amount).toBe(1000);
    expect(categoryChange(rows,'2026-11','2026-10')[0].change).toBe(600);
  });
});
