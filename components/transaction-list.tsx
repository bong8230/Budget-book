import Link from "next/link";
import { dayLabel, formatSigned, formatWon } from "./format";

export type TransactionRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  occurredOn: string;
  memo: string;
  categoryName: string | null;
  authorName: string;
  fromImport?: boolean;
};

export function TransactionList({ items, emptyText = "아직 내역이 없어요" }: { items: TransactionRow[]; emptyText?: string }) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">{emptyText}</p>;
  }

  const groups = new Map<string, TransactionRow[]>();
  for (const item of items) {
    const list = groups.get(item.occurredOn) ?? [];
    list.push(item);
    groups.set(item.occurredOn, list);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, rows]) => {
        const net = rows.reduce((sum, r) => sum + (r.type === "income" ? r.amount : r.type === "expense" ? -r.amount : 0), 0);
        return (
          <section key={day}>
            <header className="tabular mb-1.5 flex justify-between px-1 text-xs text-muted">
              <span>{dayLabel(day)}</span>
              <span>{net === 0 ? "" : net > 0 ? `+${formatWon(net)}` : `-${formatWon(-net)}`}</span>
            </header>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/transactions/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-muted">
                      {(r.categoryName ?? (r.type === "transfer" ? "이체" : "기타")).slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{r.memo || r.categoryName || "내역"}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.categoryName ?? "미분류"} · {r.authorName}
                        {r.fromImport ? " · 자동" : ""}
                      </span>
                    </span>
                    <span
                      className={`tabular shrink-0 font-semibold ${r.type === "income" ? "text-income" : r.type === "expense" ? "text-ink" : "text-muted"}`}
                    >
                      {formatSigned(r.amount, r.type)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
