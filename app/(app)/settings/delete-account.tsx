"use client";

import { useState } from "react";
import { createClient } from "@/lib/db/client";

export function DeleteAccount({ lastMember }: { lastMember: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (!res.ok) {
      setBusy(false);
      return setError("탈퇴하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
    try {
      const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager.getSubscription();
      await sub?.unsubscribe();
    } catch {
      // 무시
    }
    await createClient().auth.signOut();
    window.location.replace("/login?deleted=1");
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 block text-xs text-muted underline">
        회원 탈퇴
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-2 rounded-xl border border-expense/50 p-3 text-sm">
      <p className="font-semibold text-expense">정말 탈퇴할까요?</p>
      <p className="text-xs text-muted">
        {lastMember
          ? "가계부에 남은 사람이 없어서 가계부와 모든 거래가 함께 지워져요. 되돌릴 수 없으니 먼저 CSV로 내보내 두세요."
          : "내 계정과 기기 토큰·알림 설정이 지워져요. 가계부와 거래는 배우자에게 남고, 내가 입력한 거래의 작성자는 ‘탈퇴한 멤버’로 보여요."}
      </p>
      <label htmlFor="delete-confirm" className="block text-xs">
        확인을 위해 <b>탈퇴</b>라고 입력하세요
      </label>
      <input
        id="delete-confirm"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-bg px-3"
      />
      {error && <p className="text-xs text-expense">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-10 flex-1 rounded-lg border border-line">
          취소
        </button>
        <button
          type="button"
          disabled={confirmText !== "탈퇴" || busy}
          onClick={remove}
          className="h-10 flex-1 rounded-lg bg-expense font-semibold text-white disabled:opacity-40"
        >
          {busy ? "처리 중…" : "탈퇴하기"}
        </button>
      </div>
    </div>
  );
}
