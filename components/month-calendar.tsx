import Link from "next/link";
import type { TransactionRow } from "./transaction-list";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 좁은 칸에 들어가도록 줄인 금액: 8,500 / 1.2만 / 120만 */
export function compactWon(amount: number): string {
  if (amount < 10_000) return amount.toLocaleString("ko-KR");
  const man = amount / 10_000;
  if (man < 100) return `${Math.floor(man * 10) / 10}만`;
  return `${Math.floor(man).toLocaleString("ko-KR")}만`;
}

/** 날짜별 수입·지출 합계 (이체는 제외) */
export function dailyTotals(items: TransactionRow[]) {
  const map = new Map<string, { income: number; expense: number; count: number }>();
  for (const r of items) {
    const d = map.get(r.occurredOn) ?? { income: 0, expense: 0, count: 0 };
    if (r.type === "income") d.income += r.amount;
    if (r.type === "expense") d.expense += r.amount;
    d.count += 1;
    map.set(r.occurredOn, d);
  }
  return map;
}

export function MonthCalendar({
  month,
  items,
  selected,
  today,
  hrefFor,
}: {
  month: string;
  items: TransactionRow[];
  selected: string | null;
  today: string;
  hrefFor: (day: string) => string;
}) {
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const totals = dailyTotals(items);

  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);

  return (
    <section className="rounded-2xl bg-surface p-2" aria-label="달력">
      <div className="grid grid-cols-7 pb-1 text-center text-xs text-muted">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? "text-expense" : undefined}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} aria-hidden />;
          const t = totals.get(day);
          const d = Number(day.slice(8));
          const isSelected = day === selected;
          const isToday = day === today;
          const label = `${d}일${t ? `, 수입 ${t.income}원, 지출 ${t.expense}원` : ", 내역 없음"}`;
          return (
            <Link
              key={day}
              href={hrefFor(day)}
              scroll={false}
              replace
              aria-label={label}
              aria-current={isSelected ? "date" : undefined}
              className={`tabular flex min-h-14 flex-col items-center rounded-lg px-0.5 pt-1 pb-1 text-center leading-tight ${
                isSelected ? "bg-accent text-accent-ink" : "active:bg-surface-2"
              }`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-[13px] ${
                  isToday && !isSelected ? "ring-1 ring-accent font-semibold" : ""
                } ${!isSelected && i % 7 === 0 ? "text-expense" : ""}`}
              >
                {d}
              </span>
              {t && t.income > 0 && (
                <span className={`w-full truncate text-[10px] ${isSelected ? "" : "text-income"}`}>+{compactWon(t.income)}</span>
              )}
              {t && t.expense > 0 && <span className="w-full truncate text-[10px]">-{compactWon(t.expense)}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
