import { RuleSuggestion } from "@/components/rule-suggestion";
import { getAppContext } from "@/app/_lib/context";
import { sumByType, toRows } from "@/app/_lib/rows";
import { listCategories, listPaymentMethods, listTransactions } from "@/lib/db/queries";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionList } from "@/components/transaction-list";
import { MonthCalendar } from "@/components/month-calendar";
import Link from "next/link";
import { dayLabel, formatWon, isMonthKey } from "@/components/format";

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const metadata = { title: "내역 · 우리집 가계부" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string; day?: string; suggest?: string; cat?: string }> }) {
  const { month: raw, view, day: rawDay, suggest, cat } = await searchParams;
  const today = seoulToday();
  const month = isMonthKey(raw) ? raw : today.slice(0, 7);
  const calendar = view === "calendar";
  // 고른 날짜가 없으면 이번 달은 오늘, 다른 달은 선택 없음
  const day = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) && rawDay.startsWith(month) ? rawDay : today.startsWith(month) ? today : null;
  const { db, user, ledger, members } = await getAppContext();

  const [{ data: txs }, { data: categories }, { data: methods }] = await Promise.all([
    listTransactions(db, ledger.id, month),
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
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
  const rows = toRows(transactions, categories ?? [], members, user.id, methods ?? []);
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {suggest && cat && (categories ?? []).some((c) => c.id === cat) && (
        <RuleSuggestion keyword={suggest.slice(0, 40)} categoryId={cat} categoryName={(categories ?? []).find((c) => c.id === cat)!.name} />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <MonthSwitcher month={month} basePath="/transactions" query={calendar ? "view=calendar" : undefined} />
        </div>
        <ViewToggle month={month} calendar={calendar} />
      </div>

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

      {calendar ? (
        <>
          <MonthCalendar
            month={month}
            items={rows}
            selected={day}
            today={today}
            hrefFor={(d) => `/transactions?view=calendar&month=${month}&day=${d}`}
          />
          {day && (
            <section className="space-y-2" aria-live="polite">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">{dayLabel(day)}</h2>
                <Link href={`/transactions/new?date=${day}`} className="text-sm font-semibold text-accent">
                  + 이 날 추가
                </Link>
              </div>
              <TransactionList items={rows.filter((r) => r.occurredOn === day)} emptyText="이 날은 내역이 없어요" />
            </section>
          )}
        </>
      ) : (
        <TransactionList items={rows} emptyText="이 달에는 내역이 없어요" />
      )}
    </div>
  );
}

function ViewToggle({ month, calendar }: { month: string; calendar: boolean }) {
  const base = "rounded-full px-3 py-1.5";
  return (
    <nav aria-label="보기 방식" className="flex shrink-0 rounded-full bg-surface p-0.5 text-sm">
      <Link href={`/transactions?month=${month}`} aria-current={calendar ? undefined : "page"} className={`${base} ${calendar ? "text-muted" : "bg-accent font-semibold text-accent-ink"}`}>
        목록
      </Link>
      <Link
        href={`/transactions?view=calendar&month=${month}`}
        aria-current={calendar ? "page" : undefined}
        className={`${base} ${calendar ? "bg-accent font-semibold text-accent-ink" : "text-muted"}`}
      >
        달력
      </Link>
    </nav>
  );
}
