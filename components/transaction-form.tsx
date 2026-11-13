"use client";

import { useActionState, useState } from "react";
import { formatWon, todayIso } from "./format";

export type CategoryOption = { id: string; name: string; type: "income" | "expense" };
export type PaymentOption = { id: string; name: string; kind: "card" | "account" | "cash" };

export type TransactionFormValues = {
  type: "income" | "expense" | "transfer";
  amount: number;
  occurredOn: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  memo: string;
};

/** go: 저장 후 이동할 주소. 같은 화면(주소 뒤 ?만 다름)으로의 서버 redirect는 가끔 멈춰서, 이때는 페이지를 새로 연다 */
export type FormState = { error?: string; go?: string } | undefined;

type Props = {
  categories: CategoryOption[];
  paymentMethods?: PaymentOption[];
  initial?: Partial<TransactionFormValues>;
  submitLabel?: string;
  /** 서버 액션. 성공하면 redirect하고, 실패하면 { error }를 돌려준다 */
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** 이 폼에 같이 렌더링할 숨은 필드 (예: importId) */
  hidden?: Record<string, string>;
  /** 새로 입력할 때만: 일시불 / 할부 / 반복 고르기 */
  allowPlans?: boolean;
};

type Plan = "once" | "installment" | "repeat";
const INSTALLMENT_MONTHS = [2, 3, 4, 5, 6, 10, 12, 18, 24, 36];
const FREQUENCIES = [
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매달" },
  { value: "yearly", label: "매년" },
] as const;

const TYPES = [
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
  { value: "transfer", label: "이체" },
] as const;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"] as const;
const MAX_AMOUNT = 9_999_999_999;

export function TransactionForm({ categories, paymentMethods = [], initial, submitLabel = "저장", action, hidden, allowPlans = false }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<TransactionFormValues["type"]>(initial?.type ?? "expense");
  const [amount, setAmount] = useState<number>(initial?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(initial?.paymentMethodId ?? null);

  const [plan, setPlan] = useState<Plan>("once");
  const [months, setMonths] = useState(3);
  const [endMode, setEndMode] = useState<"none" | "date" | "count">("none");
  const effectivePlan: Plan = plan === "installment" && type !== "expense" ? "once" : plan;
  const perMonth = Math.floor(amount / months);
  const firstMonth = perMonth + (amount - perMonth * months);

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
      <input type="hidden" name="paymentMethodId" value={paymentMethodId ?? ""} />
      <input type="hidden" name="plan" value={effectivePlan} />

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

      {allowPlans && (
        <div role="radiogroup" aria-label="결제 방식" className="grid grid-cols-3 rounded-xl bg-surface-2 p-1 text-sm">
          {(
            [
              ["once", type === "expense" ? "일시불" : "한 번"],
              ["installment", "할부"],
              ["repeat", "반복"],
            ] as const
          )
            .filter(([value]) => value !== "installment" || type === "expense")
            .map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={effectivePlan === value}
                onClick={() => setPlan(value)}
                className={`rounded-lg py-1.5 font-semibold ${effectivePlan === value ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-2xl bg-surface px-4 py-3 text-sm">
        {effectivePlan === "installment" && (
          <>
            <label htmlFor="months" className="text-muted">
              할부 개월
            </label>
            <select id="months" name="months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="bg-transparent text-right">
              {INSTALLMENT_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}개월
                </option>
              ))}
            </select>
            {amount > 0 && (
              <p className="tabular col-span-2 text-right text-xs text-muted">
                매달 {formatWon(perMonth)}
                {firstMonth !== perMonth ? ` (첫 달 ${formatWon(firstMonth)})` : ""} × {months}개월
              </p>
            )}
          </>
        )}
        {effectivePlan === "repeat" && (
          <>
            <label htmlFor="frequency" className="text-muted">
              반복
            </label>
            <select id="frequency" name="frequency" defaultValue="monthly" className="bg-transparent text-right">
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <label htmlFor="endMode" className="text-muted">
              끝
            </label>
            <select id="endMode" name="endMode" value={endMode} onChange={(e) => setEndMode(e.target.value as typeof endMode)} className="bg-transparent text-right">
              <option value="none">계속</option>
              <option value="date">날짜까지</option>
              <option value="count">횟수만큼</option>
            </select>
            {endMode === "date" && (
              <>
                <label htmlFor="endDate" className="text-muted">
                  끝나는 날
                </label>
                <input id="endDate" name="endDate" type="date" required className="bg-transparent text-right" />
              </>
            )}
            {endMode === "count" && (
              <>
                <label htmlFor="maxCount" className="text-muted">
                  횟수
                </label>
                <input id="maxCount" name="maxCount" type="number" inputMode="numeric" min={1} max={600} required defaultValue={12} className="bg-transparent text-right" />
              </>
            )}
          </>
        )}
        {paymentMethods.length > 0 && (
          <>
            <label htmlFor="paymentMethod" className="text-muted">
              결제수단
            </label>
            <select
              id="paymentMethod"
              value={paymentMethodId ?? ""}
              onChange={(e) => setPaymentMethodId(e.target.value || null)}
              className="bg-transparent text-right"
            >
              <option value="">선택 안 함</option>
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="occurredOn" className="text-muted">
          {effectivePlan === "installment" ? "첫 결제일" : effectivePlan === "repeat" ? "시작일" : "날짜"}
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
