import { describe, expect, it } from 'vitest';
import { parseNotification } from '@/lib/import/parse';
import { dedupeHash } from '@/lib/import/dedupe';
import { calculateBudget } from '@/lib/budget';
describe('import parsing', () => {
  it('extracts a clear payment for review', () => expect(parseNotification('결제 12,500원 2026-11-11')).toEqual({ type: 'expense', amount: 12500, occurred_on: '2026-11-11', merchant: null }));
  it('ignores balances and leaves conflicting types empty', () => expect(parseNotification('입금 출금 3,000원 잔액 5,000원')).toMatchObject({ amount: 3000, type: null }));
  it('leaves multiple transaction amounts for review', () => expect(parseNotification('결제 3,000원 5,000원').amount).toBeNull());
  it('rejects impossible dates', () => expect(parseNotification('입금 100원 2026-02-31').occurred_on).toBeNull());
  it('reads a short date and merchant with an explicit received time', () => expect(parseNotification('카드 승인 12,300원 11/11 12:30 스타벅스', new Date('2026-11-11T03:30:00Z'))).toMatchObject({ amount: 12300, occurred_on: '2026-11-11', merchant: '스타벅스' }));
  it('normalizes whitespace for duplicate checking', () => expect(dedupeHash('입금  1원')).toBe(dedupeHash('입금\n1원')));
  it('budgets only expenses', () => expect(calculateBudget(100, [{type:'expense',amount:40},{type:'income',amount:50}]).remaining).toBe(60));
});
