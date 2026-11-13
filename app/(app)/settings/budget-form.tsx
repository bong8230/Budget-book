"use client";

import { useActionState, useState } from "react";
import { setBudgetAction } from "../actions";

const fmt = new Intl.NumberFormat("ko-KR");

export function BudgetForm({ month, current }: { month: string; current: number | null }) {
  const [state, action, pending] = useActionState(setBudgetAction, undefined);
  const [value, setValue] = useState(current ? fmt.format(current) : "");

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="month" value={month} />
      <div className="flex items-center gap-2">
        <label htmlFor="budget-amount" className="sr-only">
          월 예산
        </label>
        <input
          id="budget-amount"
          name="amount"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 10);
            setValue(digits ? fmt.format(Number(digits)) : "");
          }}
          placeholder="예: 2,500,000"
          className="tabular h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-right outline-none focus:border-accent"
        />
        <span className="text-muted">원</span>
        <button type="submit" disabled={pending} className="h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
          저장
        </button>
      </div>
      {state?.error && <p className="text-sm text-expense">{state.error}</p>}
      {state && !state.error && !pending && <p className="text-sm text-accent">저장했어요</p>}
    </form>
  );
}
