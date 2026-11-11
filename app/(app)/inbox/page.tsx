import Link from "next/link";
import { getAppContext } from "@/app/_lib/context";
import { listPendingImports } from "@/lib/db/queries";
import type { ImportItem } from "@/lib/db/types";
import { dayLabel, formatSigned } from "@/components/format";
import { ignoreImportAction, quickAcceptImportAction } from "../actions";

export const metadata = { title: "확인 대기 · 우리집 가계부" };

const SOURCE_LABEL: Record<string, string> = { sms: "문자", notification: "앱 알림", csv: "파일", manual: "직접" };

const ERRORS: Record<string, string> = {
  accept: "등록하지 못했어요. 이미 처리됐거나 금액·날짜를 읽지 못한 내역이면 ‘수정 후 등록’을 써주세요.",
  ignore: "무시 처리하지 못했어요. 다시 시도해주세요.",
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { db, ledger } = await getAppContext();
  const { data } = await listPendingImports(db, ledger.id);
  const items = (data ?? []) as ImportItem[];

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-lg font-bold">확인 대기</h1>
        <p className="mt-1 text-sm text-muted">내 폰에서 가져온 입출금 알림이에요. 등록할 것만 골라주세요.</p>
      </header>

      {error && ERRORS[error] && (
        <p role="alert" className="rounded-2xl bg-surface p-3 text-sm text-expense">
          {ERRORS[error]}
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
            <InboxCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxCard({ item }: { item: ImportItem }) {
  const ready = item.amount != null && item.type != null && item.occurred_on != null;
  const isCancel = /취소/.test(item.raw_text);

  return (
    <li className="rounded-2xl bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.merchant || "알 수 없는 내역"}</p>
          <p className="text-xs text-muted">
            {item.occurred_on ? dayLabel(item.occurred_on) : "날짜 미확인"} · {SOURCE_LABEL[item.source] ?? item.source}
          </p>
        </div>
        <p className={`tabular shrink-0 font-bold ${item.type === "income" ? "text-income" : ""}`}>
          {item.amount != null && item.type ? formatSigned(Number(item.amount), item.type) : "금액 미확인"}
        </p>
      </div>

      {isCancel && <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-warn">취소 알림일 수 있어요. 원래 거래를 확인해주세요.</p>}

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
            className="h-10 w-full rounded-xl bg-accent text-accent-ink disabled:opacity-40"
          >
            등록
          </button>
        </form>
      </div>
    </li>
  );
}
