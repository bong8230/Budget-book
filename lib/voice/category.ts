import type { Category, PaymentMethod, Rule } from '@/lib/db/types';
import { matchPaymentMethod, matchRule } from '@/lib/rules/match';

const hints: [RegExp, string][] = [
  [/카페|커피|빵집|베이커리/, '카페·간식'],
  [/마트|편의점|식당|음식점|배달/, '식비'],
  [/택시|버스|지하철/, '교통'],
  [/병원|약국/, '의료'],
  [/월급|급여/, '급여'],
  [/용돈|부업/, '부수입'],
];

export function guessCategory(text: string, merchant: string | null, type: Category['type'], categories: Category[], rules: Rule[], methods: PaymentMethod[] = []) {
  const rule = matchRule(text, merchant, rules);
  const possible = categories.filter(category => category.type === type);
  const input = (text + ' ' + (merchant ?? '')).normalize('NFKC').toLowerCase();
  const category = possible.find(c => c.id === rule?.category_id)
    ?? possible.sort((a, b) => b.name.length - a.name.length).find(c => input.includes(c.name.normalize('NFKC').toLowerCase()))
    ?? hints.filter(([keyword]) => keyword.test(input)).map(([, name]) => possible.find(c => c.name === name)).find(Boolean);
  return { categoryId: category?.id ?? null, paymentMethodId: rule?.payment_method_id ?? matchPaymentMethod(input, methods)?.id ?? null };
}
