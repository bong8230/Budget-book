"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/client";

/** 배우자가 입력·수정하면 현재 화면의 서버 데이터를 다시 불러온다 */
export function RealtimeRefresh({ ledgerId }: { ledgerId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const db = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
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

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      db.removeChannel(channel);
    };
  }, [ledgerId, router]);

  return null;
}
