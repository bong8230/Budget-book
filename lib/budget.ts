export function calculateBudget(limit: number, transactions: { amount: number; type: 'income' | 'expense' | 'transfer' }[]) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid budget');
  const spent = transactions.reduce((total, item) => {
    if (!Number.isSafeInteger(item.amount) || item.amount < 0) throw new Error('Invalid amount');
    return total + (item.type === 'expense' ? item.amount : 0);
  }, 0);
  if (!Number.isSafeInteger(spent)) throw new Error('Budget total is too large');
  return { limit, spent, remaining: limit - spent, percentage: limit ? spent / limit * 100 : null };
}
