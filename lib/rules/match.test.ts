import { describe, expect, it } from 'vitest';
import type { Rule } from '@/lib/db/types';
import { ruleCoversMerchant } from './match';

const rule = (keyword: string) => ({ id: 'r', ledger_id: 'l', keyword, category_id: 'c', set_type: null, payment_method_id: null, auto_accept: true, created_by: null, created_at: '2026-01-01' }) as Rule;

describe('ruleCoversMerchant', () => {
  it('가게 이름에 키워드가 있으면 자동 등록 대상', () => {
    expect(ruleCoversMerchant(rule('스타벅스'), '스타벅스 강남점', '')).toBe(true);
    expect(ruleCoversMerchant(rule('ＧＳ25'), 'gs25 역삼', '')).toBe(true);
  });
  it('다른 가게 알림 본문에만 키워드가 있으면 제외', () => {
    expect(ruleCoversMerchant(rule('스타벅스'), '이디야커피', '스타벅스 쿠폰 사용 이디야커피 4,500원')).toBe(false);
  });
  it('가게 이름을 못 읽었으면 알림 본문에서만 찾는다(앱 이름 제외)', () => {
    expect(ruleCoversMerchant(rule('급여'), null, '[입금] 3,000,000원 급여')).toBe(true);
    expect(ruleCoversMerchant(rule('토스'), null, '[출금] 12,000원')).toBe(false);
  });
});
