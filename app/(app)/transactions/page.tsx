import { getAppContext } from "@/app/_lib/context";
import { sumByType, toRows } from "@/app/_lib/rows";
import { listCategories, listTransactions } from "@/lib/db/queries";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionList } from "@/components/transaction-list";
import { formatWon, isMonthKey, monthKey } from "@/components/format";

export const metadata = { title: "내역 · 우리집 가계부" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: raw } = await searchParams;
  const month = isMonthKey(raw) ? raw : monthKey();
  const { db, user, ledger, members } = await getAppContext();

  const [{ data: txs }, { data: categories }] = await Promise.all([
    listTransactions(db, ledger.id, month),
    listCategories(db, ledger.id),
  ]);
  const transactions = txs ?? [];
  const { income, expense } = sumByType(transactions);

  const byCategory = new Map<string, number>();
  const names = new Map((categories ?? []).map((c) => [c.id, c.name]));
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const key = (t.category_id && names.get(t.category_id)) || "미분류";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(t.amount));
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <MonthSwitcher month={month} basePath="/transactions" />

      <section className="tabular grid grid-cols-3 rounded-2xl bg-surface p-4 text-center text-sm">
        <div>
          <p className="text-xs text-muted">수입</p>
          <p className="mt-0.5 font-semibold text-income">{formatWon(income)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">지출</p>
          <p className="mt-0.5 font-semibold">{formatWon(expense)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">합계</p>
          <p className={`mt-0.5 font-semibold ${income - expense < 0 ? "text-expense" : ""}`}>{formatWon(income - expense)}</p>
        </div>
      </section>

      {top.length > 0 && (
        <details className="rounded-2xl bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold">카테고리별 지출</summary>
          <ul className="mt-3 space-y-2.5">
            {top.map(([name, amount]) => (
              <li key={name} className="text-sm">
                <div className="tabular flex justify-between">
                  <span>{name}</span>
                  <span>
                    {formatWon(amount)} <span className="text-muted">({Math.round((amount / expense) * 100)}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(amount / top[0][1]) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <TransactionList items={toRows(transactions, categories ?? [], members, user.id)} emptyText="이 달에는 내역이 없어요" />
    </div>
  );
}
