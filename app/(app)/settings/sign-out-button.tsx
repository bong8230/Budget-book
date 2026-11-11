"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/db/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        // 이 기기의 푸시 구독을 지워 다음에 로그인하는 계정으로 알림이 새지 않게 한다
        try {
          const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager.getSubscription();
          if (sub) {
            await fetch("/api/push/subscribe", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            await sub.unsubscribe();
          }
        } catch {
          // 푸시 미지원 브라우저: 그냥 로그아웃
        }
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      className="mt-3 text-sm text-expense"
    >
      로그아웃
    </button>
  );
}
