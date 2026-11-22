import { RuleSuggestion } from "@/components/rule-suggestion";
import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { listCategories, listPaymentMethods, listPendingImports } from "@/lib/db/queries";
import type { ImportItem } from "@/lib/db/types";
import { dayLabel, formatSigned, formatWon } from "@/components/format";
import { ignoreImportAction, mergeImportAction, quickAcceptImportAction } from "../actions";

export const metadata = { title: "확인 대기 · 우리집 가계부" };

const SOURCE_LABEL: Record<string, string> = { sms: "문자", notification: "앱 알림", csv: "파일", manual: "직접" };

const ERRORS: Record<string, string> = {
  accept: "등록하지 못했어요. 이미 처리됐거나 금액·날짜를 읽지 못한 내역이면 ‘수정 후 등록’을 써주세요.",
  ignore: "무시 처리하지 못했어요. 다시 시도해주세요.",
  merge: "합치지 못했어요. 대상 거래가 지워졌거나 이미 다른 내역과 합쳐졌을 수 있어요.",
};
const DONE: Record<string, string> = {
  merge: "기존 거래와 합쳤어요.",
  rule: "규칙을 만들었어요. 다음부터 같은 내역은 자동으로 분류돼요.",
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string; suggest?: string; cat?: string }> }) {
  const { error, done, suggest, cat } = await searchParams;
  const { db, ledger } = await getAppContext();
  const [{ data }, { data: categories }, { data: methods }] = await Promise.all([
    listPendingImports(db, ledger.id),
    listCategories(db, ledger.id),
    listPaymentMethods(db, ledger.id),
  ]);
  const items = (data ?? []) as ImportItem[];
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const methodName = new Map((methods ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="space-y-4">
      {suggest && cat && (categories ?? []).some((c) => c.id === cat) && (
        <RuleSuggestion keyword={suggest.slice(0, 40)} categoryId={cat} categoryName={(categories ?? []).find((c) => c.id === cat)!.name} />
      )}
      <header className="px-1">
        <h1 className="text-lg font-bold">확인 대기</h1>
        <p className="mt-1 text-sm text-muted">내 폰에서 가져온 입출금 알림이에요. 등록할 것만 골라주세요.</p>
      </header>

      {error && ERRORS[error] && (
        <p role="alert" className="rounded-2xl bg-surface p-3 text-sm text-expense">
          {ERRORS[error]}
        </p>
      )}
      {done && DONE[done] && (
        <p role="status" className="rounded-2xl bg-surface p-3 text-sm text-income">
          {DONE[done]}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">
          <p>확인할 내역이 없어요.</p>
          <Link href="/settings#import" className="mt-2 inline-block text-accent">
            자동 가져오기 설정
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <InboxCard
              key={item.id}
              item={item}
              categoryName={item.category_id ? categoryName.get(item.category_id) : undefined}
              methodName={item.payment_method_id ? methodName.get(item.payment_method_id) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxCard({ item, categoryName, methodName }: { item: ImportItem; categoryName?: string; methodName?: string }) {
  const ready = item.amount != null && item.type != null && item.occurred_on != null;
  const isCancel = /취소/.test(item.raw_text);
  const dup = item.duplicate;
  const tags = [item.type === "transfer" ? "이체" : categoryName, methodName].filter(Boolean);

  return (
    <li className="rounded-2xl bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.merchant || "알 수 없는 내역"}</p>
          <p className="text-xs text-muted">
            {item.occurred_on ? dayLabel(item.occurred_on) : "날짜 미확인"} · {SOURCE_LABEL[item.source] ?? item.source}
          </p>
        </div>
        <p className={`tabular shrink-0 font-bold ${item.type === "income" ? "text-income" : item.type === "transfer" ? "text-muted" : ""}`}>
          {item.amount != null && item.type ? formatSigned(Number(item.amount), item.type) : "금액 미확인"}
        </p>
      </div>

      {tags.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5">
              {t}
            </span>
          ))}
          {item.rule_id && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">규칙 적용</span>}
        </p>
      )}

      {item.type === "transfer" && (
        <p className="mt-2 text-xs text-muted">카드대금·계좌 이동으로 보여서 지출 합계와 예산에서 빠져요.</p>
      )}
      {isCancel && <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-warn">취소 알림일 수 있어요. 원래 거래를 확인해주세요.</p>}

      {dup && (
        <div className="mt-3 rounded-xl border border-warn/50 p-3 text-sm">
          <p className="font-semibold">이미 입력한 내역과 같아 보여요</p>
          <p className="tabular mt-0.5 text-xs text-muted">
            {dayLabel(dup.occurred_on)} · {dup.memo || "메모 없음"} · {formatWon(Number(dup.amount))}
          </p>
          <form action={mergeImportAction} className="mt-2">
            <input type="hidden" name="importId" value={item.id} />
            <input type="hidden" name="transactionId" value={dup.id} />
            <button type="submit" className="h-10 w-full rounded-xl bg-accent font-semibold text-accent-ink">
              합치기 (새로 만들지 않음)
            </button>
          </form>
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted">원문 보기</summary>
        <p className="mt-1.5 rounded-lg bg-surface-2 p-2.5 text-xs break-all whitespace-pre-wrap text-muted">{item.raw_text}</p>
      </details>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
        <form action={ignoreImportAction}>
          <input type="hidden" name="importId" value={item.id} />
          <button type="submit" className="h-10 w-full rounded-xl bg-surface-2 text-muted">
            무시
          </button>
        </form>
        <Link href={`/inbox/${item.id}`} className="grid h-10 place-items-center rounded-xl border border-line">
          수정 후 등록
        </Link>
        <form action={quickAcceptImportAction}>
          <input type="hidden" name="importId" value={item.id} />
          <button
            type="submit"
            disabled={!ready}
            title={ready ? undefined : "금액이나 날짜를 읽지 못했어요. 수정 후 등록해주세요"}
            className={`h-10 w-full rounded-xl disabled:opacity-40 ${dup ? "border border-line" : "bg-accent text-accent-ink"}`}
          >
            {dup ? "따로 등록" : "등록"}
          </button>
        </form>
      </div>

      {item.merchant && !item.rule_id && (
        <Link
          href={`/settings/rules/new?keyword=${encodeURIComponent(item.merchant)}&back=/inbox`}
          className="mt-2 block text-center text-xs text-accent"
        >
          ‘{item.merchant}’ 자동 분류 규칙 만들기
        </Link>
      )}
    </li>
  );
}
