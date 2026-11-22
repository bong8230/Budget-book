"use client";

import { useState, useTransition } from "react";
import { createRuleFromSuggestionAction } from "@/app/(app)/actions";

/** 카테고리를 바꾼 직후: "다음에도 ○○는 △△로 분류할까요?" */
export function RuleSuggestion({ keyword, categoryId, categoryName }: { keyword: string; categoryId: string; categoryName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 제안 파라미터를 지운 주소로 (같은 경로 리다이렉트는 서버 액션에서 멈출 수 있어 클라이언트에서 이동)
  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("suggest");
    url.searchParams.delete("cat");
    window.location.replace(url.pathname + url.search);
  }

  function save(autoAccept: boolean) {
    setError(null);
    start(async () => {
      const res = await createRuleFromSuggestionAction(keyword, categoryId, autoAccept);
      if (res.ok) close();
      else setError(res.error ?? "규칙을 만들지 못했어요");
    });
  }

  return (
    <section aria-label="분류 규칙 제안" className="rounded-2xl border border-accent/40 bg-surface p-4">
      <p className="text-sm">
        다음에도 <b>‘{keyword}’</b>은(는) <b>{categoryName}</b>(으)로 분류할까요?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => save(false)} className="h-10 rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink disabled:opacity-40">
          규칙 만들기
        </button>
        <button type="button" disabled={pending} onClick={() => save(true)} className="h-10 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">
          자동 등록까지
        </button>
        <button type="button" disabled={pending} onClick={close} className="h-10 px-2 text-sm text-muted">
          괜찮아요
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">‘자동 등록까지’를 고르면 이 가게 결제 알림은 확인 대기함을 거치지 않고 바로 등록돼요.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-expense">
          {error}
        </p>
      )}
    </section>
  );
}
