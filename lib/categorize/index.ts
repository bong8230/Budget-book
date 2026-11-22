import type { Category, PaymentMethod, Rule, TransactionType } from '@/lib/db/types';
import { matchPaymentMethod, matchRule } from '@/lib/rules/match';
import { dictionaryCategory, normalizeMerchant } from './dictionary';

type Input = { text: string; merchant: string | null; type: TransactionType | null; categories: Category[]; rules: Rule[]; methods: PaymentMethod[]; history?: Map<string, string> };

export function suggestCategory({ text, merchant, type, categories, rules, methods, history }: Input) {
  const rule = matchRule(text, merchant, rules);
  const paymentMethodId = rule?.payment_method_id ?? matchPaymentMethod(text + ' ' + (merchant ?? ''), methods)?.id ?? null;
  const possible = categories.filter(c => c.type === type);
  const ruleCategory = possible.find(c => c.id === rule?.category_id);
  if (ruleCategory) return { categoryId: ruleCategory.id, paymentMethodId, source: 'rule' as const };
  const previous = merchant && history?.get(normalizeMerchant(merchant));
  if (previous && possible.some(c => c.id === previous)) return { categoryId: previous, paymentMethodId, source: 'history' as const };
  const categoryId = dictionaryCategory(text, merchant, possible);
  return { categoryId, paymentMethodId, source: categoryId ? 'dictionary' as const : null };
}
