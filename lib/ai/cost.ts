export type TokenUsage = { input: number; output: number; cacheCreation?: number; cacheRead?: number };
export function capKrw(budgetAmount: number | null, monthExpense: number): number {
  if (budgetAmount === null) return 0;
  if (!Number.isSafeInteger(budgetAmount) || budgetAmount < 0 || !Number.isSafeInteger(monthExpense) || monthExpense < 0) throw new Error('Invalid budget or expense');
  return Math.floor(Math.max(0, budgetAmount - monthExpense) / 10);
}
export function costKrw(usage: TokenUsage, usdKrw = Number(process.env.AI_USD_KRW ?? '1500')): number {
  const { input, output, cacheCreation = 0, cacheRead = 0 } = usage;
  if (![input, output, cacheCreation, cacheRead].every(n => Number.isSafeInteger(n) && n >= 0) || !Number.isFinite(usdKrw) || usdKrw <= 0) throw new Error('Invalid usage or exchange rate');
  return Math.ceil((input * 5 + cacheCreation * 6.25 + cacheRead * 0.5 + output * 25) / 1_000_000 * usdKrw);
}
