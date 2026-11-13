import { getAppContext } from "@/app/_lib/context";
import { listCategories, listTransactionsRange } from "@/lib/db/queries";
import { categoryBreakdown, categoryChange, monthlyTotals } from "@/lib/report";
import type { Transaction } from "@/lib/db/types";
import { CategoryBars, CategoryChanges, MonthlyBars } from "@/components/report-charts";
import { formatWon, monthKey, monthLabel, shiftMonth } from "@/components/format";

export const metadata = { title: "리포트 · 우리집 가계부" };

export default async function ReportsPage() {
  const { db, ledger } = await getAppContext();
  const current = monthKey();
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(current, i - 5));
  const previous = months[4];

  const [{ data: txs }, { data: categories }] = await Promise.all([
    listTransactionsRange(db, ledger.id, months[0], current),
    listCategories(db, ledger.id),
  ]);
  const rows = ((txs ?? []) as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount) }));
  const names = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const label = (id: string | null) => (id && names.get(id)) || "미분류";

  const totals = monthlyTotals(rows, months);
  const breakdown = categoryBreakdown(rows, current).map((c) => ({ name: label(c.categoryId), amount: c.amount }));
  const thisExpense = totals[5].expense;
  const lastExpense = totals[4].expense;
  const changes = categoryChange(rows, current, previous)
    .map((c) => ({ name: label(c.categoryId), current: c.amount, previous: c.previousAmount }))
    .sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous));
  const avg = Math.round(totals.slice(0, 5).reduce((s, t) => s + t.expense, 0) / 5);

  return (
    <div className="space-y-4">
      <h1 className="px-1 text-lg font-bold">리포트</h1>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-xs text-muted">{monthLabel(current)} 지출</p>
          <p className="tabular mt-1 text-xl font-bold">{formatWon(thisExpense)}</p>
          {lastExpense > 0 && (
            <p className="tabular mt-0.5 text-xs text-muted">
              지난달보다 {thisExpense >= lastExpense ? "+" : "-"}
              {formatWon(Math.abs(thisExpense - lastExpense))}
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-xs text-muted">최근 5개월 평균 지출</p>
          <p className="tabular mt-1 text-xl font-bold">{formatWon(avg)}</p>
          <p className="mt-0.5 text-xs text-muted">이체는 빼고 계산해요</p>
        </div>
      </section>

      <section className="rounded-2xl bg-surface p-4">
        <h2 className="mb-3 font-semibold">월별 수입·지출</h2>
        <MonthlyBars data={totals} />
      </section>

      <section className="rounded-2xl bg-surface p-4">
        <h2 className="mb-3 font-semibold">{monthLabel(current)} 카테고리별 지출</h2>
        <CategoryBars data={breakdown} total={thisExpense} />
      </section>

      <section className="rounded-2xl bg-surface p-4">
        <h2 className="mb-1 font-semibold">지난달 대비</h2>
        <p className="mb-2 text-xs text-muted">변화가 큰 카테고리 순서예요.</p>
        <CategoryChanges data={changes} />
      </section>
    </div>
  );
}
