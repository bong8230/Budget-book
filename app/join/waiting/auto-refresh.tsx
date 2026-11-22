"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 승인되면 서버 컴포넌트가 / 로 보내므로, 몇 초마다 다시 불러온다 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
