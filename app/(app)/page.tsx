import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { sumByType, toRows } from "@/app/_lib/rows";
import { getMonthlyBudget, listCategories, listPendingImports, listTransactions } from "@/lib/db/queries";
import { BudgetGauge } from "@/components/budget-gauge";
import { TransactionList } from "@/components/transaction-list";
import { formatWon, monthKey, monthLabel } from "@/components/format";

export default async function HomePage() {
  const { db, user, ledger, members } = await getAppContext();
  const month = monthKey();

  const [{ data: txs }, { data: categories }, { data: budget }, { data: pending }] = await Promise.all([
    listTransactions(db, ledger.id, month),
    listCategories(db, ledger.id),
    getMonthlyBudget(db, ledger.id, `${month}-01`),
    listPendingImports(db, ledger.id),
  ]);

  const transactions = txs ?? [];
  const { income, expense } = sumByType(transactions);
  const recent = toRows(transactions.slice(0, 5), categories ?? [], members, user.id);
  const pendingCount = pending?.length ?? 0;

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between px-1">
        <h1 className="text-lg font-bold">{ledger.name}</h1>
        <span className="text-sm text-muted">{monthLabel(month)}</span>
      </header>

      <BudgetGauge limit={budget ? Number(budget.amount) : null} spent={expense} />

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-xs text-muted">수입</p>
          <p className="tabular mt-1 font-bold text-income">{formatWon(income)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-xs text-muted">지출</p>
          <p className="tabular mt-1 font-bold">{formatWon(expense)}</p>
        </div>
      </section>

      {pendingCount > 0 && (
        <Link href="/inbox" className="flex items-center justify-between rounded-2xl border border-warn/40 bg-surface p-4 active:bg-surface-2">
          <span>
            <span className="block font-semibold">확인 대기 {pendingCount}건</span>
            <span className="block text-sm text-muted">자동으로 가져온 입출금 내역이 있어요</span>
          </span>
          <span aria-hidden className="text-muted">
            ›
          </span>
        </Link>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="font-semibold">최근 내역</h2>
          <Link href="/transactions" className="text-sm text-accent">
            전체 보기
          </Link>
        </div>
        <TransactionList items={recent} emptyText="오른쪽 아래 + 버튼으로 첫 내역을 입력해보세요" />
      </section>
    </div>
  );
}
