import Link from "next/link";
import { formatWon } from "./format";

type Props = { limit: number | null; spent: number };

export function BudgetGauge({ limit, spent }: Props) {
  if (!limit) {
    return (
      <section className="rounded-2xl bg-surface p-5">
        <p className="text-sm text-muted">이번 달 지출</p>
        <p className="tabular mt-1 text-3xl font-bold">{formatWon(spent)}</p>
        <Link href="/settings#budget" className="mt-3 inline-block text-sm text-accent underline-offset-2 hover:underline">
          월 예산 정하기
        </Link>
      </section>
    );
  }
  const ratio = spent / limit;
  const remaining = limit - spent;
  const tone = ratio >= 1 ? "bg-expense" : ratio >= 0.8 ? "bg-warn" : "bg-accent";
  return (
    <section className="rounded-2xl bg-surface p-5">
      <p className="text-sm text-muted">{remaining >= 0 ? "이번 달 남은 예산" : "이번 달 예산 초과"}</p>
      <p className={`tabular mt-1 text-3xl font-bold ${remaining < 0 ? "text-expense" : ""}`}>
        {formatWon(Math.abs(remaining))}
      </p>
      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
      <p className="tabular mt-2 flex justify-between text-xs text-muted">
        <span>
          {formatWon(spent)} 사용 ({Math.round(ratio * 100)}%)
        </span>
        <span>예산 {formatWon(limit)}</span>
      </p>
    </section>
  );
}
