import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { toOptions, toPaymentOptions } from "@/app/_lib/rows";
import { getRecurringStatus, listCategories, listInstallments, listPaymentMethods, listRecurring, suggestRecurring } from "@/lib/db/queries";
import type { InstallmentStatus, RecurringItem, RecurringStatus, RecurringSuggestion } from "@/lib/db/types";
import { formatWon, monthKey, monthLabel, todayIso } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/form-bits";
import { acceptSuggestionAction, deleteInstallmentAction, deleteRecurringAction } from "../actions";
import { RecurringForm } from "./recurring-form";

export const metadata = { title: "반복·할부 · 우리집 가계부" };

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function scheduleLabel(item: RecurringItem) {
  const start = new Date(`${item.start_date}T00:00:00Z`);
  const base =
    item.frequency === "weekly"
      ? `매주 ${WEEKDAY[start.getUTCDay()]}요일`
      : item.frequency === "yearly"
        ? `매년 ${start.getUTCMonth() + 1}월 ${start.getUTCDate()}일`
        : `매달 ${item.day_of_month === 31 ? "말" : item.day_of_month}일`;
  const end = item.end_date ? ` · ${item.end_date.slice(2).replaceAll("-", ".")}까지` : item.max_count ? ` · ${item.max_count}회` : "";
  return base + end;
}

const ERRORS: Record<string, string> = {
  delete: "삭제하지 못했어요. 다시 시도해주세요.",
  installment: "할부를 지우지 못했어요. 다시 시도해주세요.",
  suggest: "등록하지 못했어요. 다시 시도해주세요.",
};

export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { edit, error } = await searchParams;
  const { db, ledger } = await getAppContext();
  const month = monthKey();
  const today = todayIso();
  const [statuses, suggestions, { data: all }, { data: categories }, { data: methods }, installments] = await Promise.all([
    getRecurringStatus(db, ledger.id, month).catch((): RecurringStatus[] => []),
    suggestRecurring(db, ledger.id).catch((): RecurringSuggestion[] => []),
    listRecurring(db, ledger.id),
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
    listInstallments(db, ledger.id, today).catch((): InstallmentStatus[] => []),
  ]);
  const activeInstallments = installments.filter((i) => i.remainingCount > 0);
  const names = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const items = (all ?? []) as RecurringItem[];
  const editing = items.find((i) => i.id === edit);
  const sorted = [...statuses].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const remaining = sorted.filter((s) => !s.matchedTransactionId && s.item.type !== "income");
  const remainingTotal = remaining.reduce((s, r) => s + Number(r.item.amount), 0);

  return (
    <>
      <PageHeader title="반복·할부" back="/" />

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
          <p className="py-6 text-center text-sm text-muted">월세·통신비·구독료처럼 반복되는 돈을 등록해보세요. 내역 입력 화면에서 ‘반복’을 골라도 돼요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {sorted.map((s) => {
              const done = Boolean(s.matchedTransactionId);
              const overdue = !done && s.dueDate < today;
              return (
                <li key={`${s.item.id}-${s.dueDate}`} className="flex items-center gap-3 py-2.5">
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
                      {scheduleLabel(s.item)} · {done ? "처리됨" : overdue ? "예정일 지남" : `${Number(s.dueDate.slice(5, 7))}/${Number(s.dueDate.slice(8))} ${s.item.auto_create ? "자동 등록" : "예정"}`}
                    </span>
                  </span>
                  <span className="tabular text-sm">{formatWon(Number(s.item.amount))}</span>
                  {!done && !s.item.auto_create && (
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
        <p className="mt-3 text-xs text-muted">자동 등록 항목은 날짜가 되면 내역에 들어가요. 수동 항목은 이름(키워드)이 같고 금액이 ±10% 안인 거래가 있으면 처리됨으로 바뀌어요.</p>
      </section>

      <section className="mb-6 rounded-2xl bg-surface p-4" aria-label="할부">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">할부 진행 중</h2>
          {activeInstallments.length > 0 && (
            <p className="tabular text-sm">
              남은 <b>{formatWon(activeInstallments.reduce((s, i) => s + i.remainingAmount, 0))}</b>
            </p>
          )}
        </div>
        {activeInstallments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">내역 입력에서 ‘할부’를 고르면 매달 나눠서 지출로 들어가요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {activeInstallments.map((i) => {
              const title = i.plan.memo || i.plan.merchant || (i.plan.category_id && names.get(i.plan.category_id)) || "할부";
              return (
                <li key={i.plan.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{title}</span>
                    <span className="tabular block text-xs text-muted">
                      {formatWon(Number(i.plan.total_amount))} · {i.paidCount}/{i.plan.months}회
                      {i.nextDate ? ` · 다음 ${Number(i.nextDate.slice(5, 7))}/${Number(i.nextDate.slice(8))}` : ""}
                    </span>
                  </span>
                  <span className="tabular text-sm">{formatWon(i.remainingAmount)}</span>
                  <form action={deleteInstallmentAction}>
                    <input type="hidden" name="id" value={i.plan.id} />
                    <ConfirmButton message={`‘${title}’의 남은 할부 ${i.remainingCount}회를 지울까요? 이미 지난 회차는 남아요.`}>삭제</ConfirmButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted">혹시 반복 결제인가요?</h2>
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
          <h2 className="font-semibold">{editing ? `‘${editing.name}’ 수정` : "반복 추가"}</h2>
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
