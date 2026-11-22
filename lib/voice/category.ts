import type { Category, PaymentMethod, Rule } from '@/lib/db/types';
import { suggestCategory } from '@/lib/categorize';

export function guessCategory(text: string, merchant: string | null, type: Category['type'], categories: Category[], rules: Rule[], methods: PaymentMethod[] = [], history?: Map<string, string>) {
  const guess = suggestCategory({ text, merchant, type, categories, rules, methods, history });
  // In spoken input an explicitly named category takes precedence over a dictionary hint.
  if (guess.source !== 'rule' && guess.source !== 'history') {
    const input = text.normalize('NFKC').toLowerCase();
    const explicit = categories.filter(c => c.type === type && input.includes(c.name.normalize('NFKC').toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (explicit) return { categoryId: explicit.id, paymentMethodId: guess.paymentMethodId };
  }
  return { categoryId: guess.categoryId, paymentMethodId: guess.paymentMethodId };
}
