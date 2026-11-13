import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { toOptions, toPaymentOptions } from "@/app/_lib/rows";
import { getRecurringStatus, listCategories, listPaymentMethods, listRecurring, suggestRecurring } from "@/lib/db/queries";
import type { RecurringItem, RecurringStatus, RecurringSuggestion } from "@/lib/db/types";
import { formatWon, monthKey, monthLabel, todayIso } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/form-bits";
import { acceptSuggestionAction, deleteRecurringAction } from "../actions";
import { RecurringForm } from "./recurring-form";

export const metadata = { title: "고정지출 · 우리집 가계부" };

const ERRORS: Record<string, string> = {
  delete: "삭제하지 못했어요. 다시 시도해주세요.",
  suggest: "등록하지 못했어요. 다시 시도해주세요.",
};

export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { edit, error } = await searchParams;
  const { db, ledger } = await getAppContext();
  const month = monthKey();
  const [statuses, suggestions, { data: all }, { data: categories }, { data: methods }] = await Promise.all([
    getRecurringStatus(db, ledger.id, month).catch((): RecurringStatus[] => []),
    suggestRecurring(db, ledger.id).catch((): RecurringSuggestion[] => []),
    listRecurring(db, ledger.id),
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
  ]);
  const items = (all ?? []) as RecurringItem[];
  const editing = items.find((i) => i.id === edit);
  const today = todayIso();
  const sorted = [...statuses].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const remaining = sorted.filter((s) => !s.matchedTransactionId && s.item.type !== "income");
  const remainingTotal = remaining.reduce((s, r) => s + Number(r.item.amount), 0);

  return (
    <>
      <PageHeader title="고정지출" back="/" />

      {error && ERRORS[error] && (
        <p role="alert" className="mb-3 rounded-xl bg-surface p-3 text-sm text-expense">
          {ERRORS[error]}
        </p>
      )}

      <section className="mb-6 rounded-2xl bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{monthLabel(month)}</h2>
          <p className="tabular text-sm">
            남은 {remaining.length}건 · <b>{formatWon(remainingTotal)}</b>
          </p>
        </div>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">월세·통신비·구독료처럼 매달 나가는 돈을 등록해보세요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {sorted.map((s) => {
              const done = Boolean(s.matchedTransactionId);
              const overdue = !done && s.dueDate < today;
              return (
                <li key={s.item.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${done ? "bg-accent text-accent-ink" : "border border-line"}`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/recurring?edit=${s.item.id}#form`} className="block truncate">
                      {s.item.name}
                    </Link>
                    <span className={`block text-xs ${overdue ? "text-expense" : "text-muted"}`}>
                      매달 {s.item.day_of_month}일 · {done ? "처리됨" : overdue ? "예정일 지남" : `${Number(s.dueDate.slice(8))}일 예정`}
                    </span>
                  </span>
                  <span className="tabular text-sm">{formatWon(Number(s.item.amount))}</span>
                  {!done && (
                    <Link
                      href={`/transactions/new?recurring=${s.item.id}&date=${s.dueDate < today ? today : s.dueDate}`}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold"
                    >
                      입력
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">이번 달에 이름(키워드)이 같고 금액이 ±10% 안인 거래가 있으면 자동으로 처리됨으로 바뀌어요.</p>
      </section>

      {suggestions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted">혹시 고정지출인가요?</h2>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.keyword} className="flex items-center gap-3 rounded-2xl bg-surface p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.merchant}</span>
                  <span className="tabular block text-xs text-muted">
                    최근 {s.months}개월 · 약 {formatWon(s.amount)}
                  </span>
                </span>
                <form action={acceptSuggestionAction}>
                  <input type="hidden" name="merchant" value={s.merchant} />
                  <input type="hidden" name="keyword" value={s.keyword} />
                  <input type="hidden" name="amount" value={s.amount} />
                  <input type="hidden" name="day" value={Number(today.slice(8))} />
                  <button type="submit" className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-ink">
                    등록
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="form" className="scroll-mt-4 rounded-2xl bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">{editing ? `‘${editing.name}’ 수정` : "고정지출 추가"}</h2>
          {editing && (
            <form action={deleteRecurringAction}>
              <input type="hidden" name="id" value={editing.id} />
              <ConfirmButton message={`‘${editing.name}’을(를) 지울까요? 이미 입력한 거래는 남아요.`}>삭제</ConfirmButton>
            </form>
          )}
        </div>
        <RecurringForm
          key={editing?.id ?? "new"}
          item={editing}
          categories={toOptions(categories ?? [])}
          paymentMethods={toPaymentOptions(methods ?? [])}
        />
      </section>
    </>
  );
}
