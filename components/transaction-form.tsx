"use client";

import { useActionState, useState } from "react";
import { formatWon, todayIso } from "./format";

export type CategoryOption = { id: string; name: string; type: "income" | "expense" };

export type TransactionFormValues = {
  type: "income" | "expense" | "transfer";
  amount: number;
  occurredOn: string;
  categoryId: string | null;
  memo: string;
};

export type FormState = { error?: string } | undefined;

type Props = {
  categories: CategoryOption[];
  initial?: Partial<TransactionFormValues>;
  submitLabel?: string;
  /** 서버 액션. 성공하면 redirect하고, 실패하면 { error }를 돌려준다 */
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** 이 폼에 같이 렌더링할 숨은 필드 (예: importId) */
  hidden?: Record<string, string>;
};

const TYPES = [
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
  { value: "transfer", label: "이체" },
] as const;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"] as const;
const MAX_AMOUNT = 9_999_999_999;

export function TransactionForm({ categories, initial, submitLabel = "저장", action, hidden }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<TransactionFormValues["type"]>(initial?.type ?? "expense");
  const [amount, setAmount] = useState<number>(initial?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);

  const visibleCategories = type === "transfer" ? [] : categories.filter((c) => c.type === type);

  function press(key: (typeof KEYS)[number]) {
    setAmount((prev) => {
      if (key === "del") return Math.floor(prev / 10);
      const next = Number(`${prev}${key}`);
      return next > MAX_AMOUNT ? prev : next;
    });
  }

  return (
    <form action={formAction} className="flex min-h-[calc(100dvh-4rem)] flex-col gap-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />

      <div role="radiogroup" aria-label="거래 종류" className="grid grid-cols-3 rounded-xl bg-surface-2 p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            onClick={() => {
              setType(t.value);
              setCategoryId(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold ${type === t.value ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <output
        aria-live="polite"
        className={`tabular block py-2 text-right text-4xl font-bold ${amount === 0 ? "text-muted" : type === "income" ? "text-income" : ""}`}
      >
        {formatWon(amount)}
      </output>

      {visibleCategories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${categoryId === c.id ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-2xl bg-surface px-4 py-3 text-sm">
        <label htmlFor="occurredOn" className="text-muted">
          날짜
        </label>
        <input
          id="occurredOn"
          name="occurredOn"
          type="date"
          required
          defaultValue={initial?.occurredOn ?? todayIso()}
          className="bg-transparent text-right"
        />
        <label htmlFor="memo" className="text-muted">
          메모
        </label>
        <input
          id="memo"
          name="memo"
          maxLength={200}
          defaultValue={initial?.memo ?? ""}
          placeholder="어디에 썼나요?"
          className="bg-transparent text-right placeholder:text-muted/60"
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-expense">
          {state.error}
        </p>
      )}

      <div className="mt-auto grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === "del" ? "지우기" : k}
            className="tabular h-14 rounded-xl bg-surface text-xl font-semibold active:bg-surface-2"
          >
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending || amount <= 0}
        className="h-14 rounded-xl bg-accent text-lg font-bold text-accent-ink disabled:opacity-40"
      >
        {pending ? "저장 중…" : submitLabel}
      </button>
    </form>
  );
}
