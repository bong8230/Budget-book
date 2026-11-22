import type { PaymentMethod, Rule, TransactionType } from '@/lib/db/types';
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase();
export function matchPaymentMethod(text: string, methods: PaymentMethod[]): PaymentMethod | null {
  const input = normalize(text);
  return methods.find(m => !m.archived_at && m.keywords.some(k => k.trim() && input.includes(normalize(k.trim())))) ?? null;
}
export function matchRule(text: string, merchant: string | null, rules: Rule[]): Rule | null {
  const input = normalize(`${text} ${merchant ?? ''}`);
  return [...rules].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).find(r => r.keyword.trim() && input.includes(normalize(r.keyword.trim()))) ?? null;
}
export function classifyTransfer(text: string, type: TransactionType | null): TransactionType | null {
  return /카드대금|카드결제|결제대금|자동이체.*카드|내계좌|본인계좌/.test(text) ? 'transfer' : type;
}
/**
 * 자동 등록은 엄격하게: 가게 이름이 읽혔으면 규칙 키워드가 가게 이름에 있어야 하고
 * (다른 가게 알림 본문에만 있는 경우 제외), 못 읽었으면 알림 본문에 있어야 한다(앱 이름만 맞는 경우 제외).
 */
export function ruleCoversMerchant(rule: Rule, merchant: string | null, body: string): boolean {
  const keyword = normalize(rule.keyword.trim());
  if (!keyword) return false;
  return normalize(merchant?.trim() ? merchant : body).includes(keyword);
}
