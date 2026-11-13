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
  it.each([
    ['신한카드\n승인 12,300원\n11/11 12:30 스타벅스', 12300, 'expense', '스타벅스'],
    ['삼성카드\n승인\n25,000원\n11/11 14:10 이마트', 25000, 'expense', '이마트'],
    ['KB국민카드\n승인 4,500원\n11/11 09:30 CU강남점', 4500, 'expense', 'CU강남점'],
    ['신한은행\n입금 100,000원\n11/11 09:00\n잔액 350,000원', 100000, 'income', null],
    ['KB국민은행\n출금 50,000원\n11/11 11:12\n잔액 300,000원', 50000, 'expense', null],
    ['삼성카드\n승인취소 4,500원\n11/11 09:30 CU강남점', 4500, null, 'CU강남점'],
  ])('parses notification: %s', (text, amount, type, merchant) => expect(parseNotification(text, new Date('2026-11-11T03:30:00Z'))).toMatchObject({ amount, type, merchant, occurred_on: '2026-11-11' }));
  it('does not interpret foreign currency, balance or a foreign estimated won as a transaction amount', () => {
    expect(parseNotification('삼성카드 해외승인 USD 20.00 예상원화 28,000원').amount).toBeNull();
    expect(parseNotification('신한카드 승인 12달러 잔액 40,000원').amount).toBeNull();
  });
  it('keeps uncertain merchant empty and infers year across New Year', () => {
    expect(parseNotification('KB국민카드\n승인 4,500원\n12/31 23:59',new Date('2027-01-01T00:01:00+09:00'))).toMatchObject({ merchant: null, occurred_on: '2026-12-31' });
  });
  it('recognizes an explicitly labeled merchant and Korean month/day', () => {
    expect(parseNotification('신한카드\n승인 금액: 8,900원\n가맹점: 스타벅스 강남점\n11월 11일 12:30', new Date('2026-11-11T03:30:00Z'))).toMatchObject({ type:'expense', amount:8900, occurred_on:'2026-11-11', merchant:'스타벅스 강남점' });
  });
  it('keeps foreign-currency merchant without inventing a KRW amount', () => {
    expect(parseNotification('KB국민카드\n해외승인 USD 10.00\n가맹점: STORE', new Date('2026-11-11T03:30:00Z'))).toMatchObject({ amount:null, merchant:'STORE' });
  });
  it('normalizes whitespace for duplicate checking', () => expect(dedupeHash('입금  1원')).toBe(dedupeHash('입금\n1원')));
  it('budgets only expenses', () => expect(calculateBudget(100, [{type:'expense',amount:40},{type:'income',amount:50}]).remaining).toBe(60));
});
