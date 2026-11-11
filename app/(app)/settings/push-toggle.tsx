"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/db/client";

type Status = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
}

export function PushToggle({ ledgerId }: { ledgerId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // 아이폰은 홈 화면에 추가한 앱에서만 웹 푸시가 된다
        return setStatus(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return setStatus("off");
      // 이 브라우저 구독이 지금 로그인한 계정 것인지 서버(RLS: 본인 행만 보임)에서 확인한다
      const { data } = await createClient().from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
      setStatus(data ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setError(null);
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return setError("서버에 푸시 키가 설정되지 않았어요");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    // 이전 계정이 남긴 구독이 있으면 버리고 새로 만든다 (엔드포인트가 바뀌어 이전 계정 행과 섞이지 않음)
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ledgerId, subscription: sub.toJSON() }),
    });
    if (!res.ok) {
      await sub.unsubscribe();
      return setError("알림을 켜지 못했어요");
    }
    setStatus("on");
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setStatus("off");
  }

  const desc = "배우자가 내역을 입력하거나 확인 대기 내역이 쌓이면 알려드려요.";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{desc}</p>
        {(status === "on" || status === "off") && (
          <button
            type="button"
            role="switch"
            aria-checked={status === "on"}
            aria-label="푸시 알림"
            onClick={status === "on" ? disable : enable}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${status === "on" ? "bg-accent" : "bg-line"}`}
          >
            <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${status === "on" ? "left-5.5" : "left-0.5"}`} />
          </button>
        )}
      </div>
      {status === "needs-install" && (
        <p className="text-xs text-muted">아이폰은 Safari의 공유 버튼 → ‘홈 화면에 추가’로 설치한 뒤, 설치한 앱에서 알림을 켤 수 있어요.</p>
      )}
      {status === "unsupported" && <p className="text-xs text-muted">이 브라우저는 웹 푸시를 지원하지 않아요.</p>}
      {status === "denied" && <p className="text-xs text-muted">알림 권한이 차단돼 있어요. 기기 설정에서 이 앱의 알림을 허용해주세요.</p>}
      {error && <p className="text-xs text-expense">{error}</p>}
    </div>
  );
}
