import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { sumByType, toRows } from "@/app/_lib/rows";
import { getMonthlyBudget, getRecurringStatus, listCategories, listPaymentMethods, listPendingImports, listTransactions } from "@/lib/db/queries";
import { BudgetGauge } from "@/components/budget-gauge";
import { TransactionList } from "@/components/transaction-list";
import { VoiceAdd } from "@/components/voice-add";
import { formatWon, monthKey, monthLabel, todayIso } from "@/components/format";

export default async function HomePage() {
  const { db, user, ledger, members } = await getAppContext();
  const month = monthKey();

  const [{ data: txs }, { data: categories }, { data: budget }, { data: pending }, { data: methods }, recurring] = await Promise.all([
    listTransactions(db, ledger.id, month),
    listCategories(db, ledger.id),
    getMonthlyBudget(db, ledger.id, `${month}-01`),
    listPendingImports(db, ledger.id),
    listPaymentMethods(db, ledger.id),
    getRecurringStatus(db, ledger.id, month).catch(() => []),
  ]);
  const upcoming = recurring.filter((r) => !r.matchedTransactionId && r.item.type !== "income");
  const upcomingTotal = upcoming.reduce((s, r) => s + Number(r.item.amount), 0);
  const today = todayIso();

  const transactions = txs ?? [];
  const { income, expense } = sumByType(transactions);
  const recent = toRows(transactions.slice(0, 5), categories ?? [], members, user.id, methods ?? []);
  const pendingCount = pending?.length ?? 0;

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between px-1">
        <h1 className="text-lg font-bold">{ledger.name}</h1>
        <span className="text-sm text-muted">{monthLabel(month)}</span>
      </header>

      <section aria-label="말로 추가" className="rounded-2xl border border-line bg-surface p-3">
        <VoiceAdd />
      </section>

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

      {recurring.length > 0 && (
        <section className="rounded-2xl bg-surface p-4">
          <Link href="/recurring" className="flex items-baseline justify-between">
            <h2 className="font-semibold">이번 달 나갈 돈</h2>
            <span className="tabular text-sm">
              {upcoming.length > 0 ? (
                <>
                  {upcoming.length}건 · <span className="font-semibold">{formatWon(upcomingTotal)}</span>
                </>
              ) : (
                <span className="text-income">모두 처리됨</span>
              )}
            </span>
          </Link>
          {upcoming.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {upcoming.slice(0, 3).map((r) => (
                <li key={`${r.item.id}-${r.dueDate}`} className="tabular flex justify-between">
                  <span className={r.dueDate < today ? "text-expense" : ""}>
                    {Number(r.dueDate.slice(8))}일 {r.item.name}
                    {r.dueDate < today ? " (지남)" : ""}
                  </span>
                  <span className="text-muted">{formatWon(Number(r.item.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
