"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/client";

/** 폼 제출 직후 이 시간 동안은 새로고침을 미룬다 (저장 후 이동과 겹치면 이동이 취소된다) */
const SUBMIT_QUIET_MS = 3000;
const DEBOUNCE_MS = 300;

/** 배우자가 입력·수정하면 현재 화면의 서버 데이터를 다시 불러온다 */
export function RealtimeRefresh({ ledgerId }: { ledgerId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmit = useRef(0);

  useEffect(() => {
    const db = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // 내가 방금 저장했다면 서버 액션이 이미 화면을 갱신·이동시키므로, 그게 끝난 뒤로 미룬다
      const wait = Math.max(DEBOUNCE_MS, lastSubmit.current + SUBMIT_QUIET_MS - Date.now());
      timer.current = setTimeout(() => router.refresh(), wait);
    };
    const onSubmit = () => {
      lastSubmit.current = Date.now();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), SUBMIT_QUIET_MS);
      }
    };
    const filter = `ledger_id=eq.${ledgerId}`;
    const channel = db
      .channel(`ledger:${ledgerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "monthly_budgets", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "imports", filter }, refresh)
      .subscribe();

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("submit", onSubmit, true);
      if (timer.current) clearTimeout(timer.current);
      db.removeChannel(channel);
    };
  }, [ledgerId, router]);

  return null;
}
