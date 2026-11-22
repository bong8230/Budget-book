import { expect, it } from 'vitest';
import type { Category, PaymentMethod, Rule } from '@/lib/db/types';
import { guessCategory } from './category';

const categories: Category[] = ['생활', '식비', '카페·간식'].map(name => ({ id: name, name, type: 'expense', ledger_id: 'l' }));
const rule: Rule = { id: 'r', ledger_id: 'l', keyword: '마트', category_id: '생활', payment_method_id: 'rule-card', set_type: null, auto_accept: false, created_by: null, created_at: '' };
const method: PaymentMethod = { id: 'card', ledger_id: 'l', name: '우리', kind: 'card', owner_id: null, keywords: ['우리카드'], archived_at: null, created_at: '' };

it('uses a rule before an explicit category and a payment keyword', () => {
  expect(guessCategory('식비 우리카드', '마트', 'expense', categories, [rule], [method])).toEqual({ categoryId: '생활', paymentMethodId: 'rule-card' });
});
it('uses explicit categories before hints, and matches payment independently', () => {
  expect(guessCategory('생활 우리카드', '마트', 'expense', categories, [], [method])).toEqual({ categoryId: '생활', paymentMethodId: 'card' });
  expect(guessCategory('결제', '카페', 'expense', categories, []).categoryId).toBe('카페·간식');
  expect(guessCategory('마트', null, 'income', categories, []).categoryId).toBeNull();
});
