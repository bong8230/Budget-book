import type { TransactionType } from '@/lib/db/types';
export type ParsedImport = { type: TransactionType | null; amount: number | null; occurred_on: string | null; merchant: string | null };
/** Conservative parsing: ambiguous or absent fields stay empty for manual review. */
export function parseNotification(text: string, receivedAt?: Date): ParsedImport {
  const income = /입금/.test(text);
  const expense = /출금|결제|승인|사용/.test(text);
  const type = /취소/.test(text) || income === expense ? null : income ? 'income' : 'expense';
  const candidates = [...text.matchAll(/(?:^|[^\d])([\d,]+)\s*원/g)].filter(m => !/잔액\s*$/.test(text.slice(Math.max(0, m.index! - 10), m.index! + 1))).map(m => Number(m[1].replace(/,/g, ''))).filter(n => Number.isSafeInteger(n) && n > 0);
  // Foreign-currency amounts and estimated KRW are not KRW transaction amounts.
  const foreign = /해외|달러|유로|엔화|위안|\b(?:USD|EUR|JPY|CNY|GBP|AUD|CAD|HKD)\b|[$€¥£]/i.test(text);
  const amount = !foreign && candidates.length === 1 ? candidates[0] : null;
  const match = text.match(/(?:^|\D)(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일|\b)/);
  let occurred_on: string | null = null;
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) occurred_on = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (!occurred_on && receivedAt && !Number.isNaN(receivedAt.getTime())) {
    const short = text.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})(?!\d)/) ?? text.match(/(?:^|\D)(\d{1,2})월\s*(\d{1,2})일/);
    if (short) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric' }).formatToParts(receivedAt);
      let year = Number(parts.find(p => p.type === 'year')?.value);
      const receivedMonth = Number(parts.find(p => p.type === 'month')?.value), month = Number(short[1]), day = Number(short[2]);
      if (receivedMonth === 1 && month === 12) year--;
      else if (receivedMonth === 12 && month === 1) year++;
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) occurred_on = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const tail = text.match(/\d[\d,]*\s*원\s+(?:20\d{2}[./-])?\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2}\s+([^\n]+)$/)?.[1]?.trim();
  const beforeAmount = text.match(/(?:승인|결제|사용)(?:취소)?[ \t]*\n([^\n]{2,60})\n[ \t]*[\d,]+\s*원/)?.[1]?.trim();
  const labeled = text.match(/(?:가맹점|사용처|거래처)[ \t]*[:：][ \t]*([^\n\r]{1,100})/)?.[1]?.trim();
  const candidate = labeled || tail || beforeAmount;
  const merchant = candidate && candidate.length <= 100 && !/잔액|누적|승인|취소|결제|출금|입금/.test(candidate) ? candidate : null;
  return { type, amount, occurred_on, merchant };
}
