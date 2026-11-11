"use client";

import { useState, useTransition } from "react";
import { createInviteAction } from "../actions";

export function InviteButton() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function create() {
    start(async () => {
      const res = await createInviteAction();
      if (res.code) setLink(`${window.location.origin}/join/${res.code}`);
      else setError(res.error ?? "초대 링크를 만들지 못했어요");
    });
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "우리집 가계부 초대", text: "같이 가계부 써요!", url: link });
        return;
      } catch {
        // 공유 시트를 닫은 경우: 복사로 넘어간다
      }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  if (!link) {
    return (
      <div className="mt-4">
        <button type="button" onClick={create} disabled={pending} className="h-11 w-full rounded-xl bg-accent font-semibold text-accent-ink disabled:opacity-50">
          {pending ? "만드는 중…" : "배우자 초대 링크 만들기"}
        </button>
        {error && <p className="mt-2 text-sm text-expense">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="rounded-lg bg-surface-2 p-2.5 text-xs break-all">{link}</p>
      <p className="text-xs text-muted">7일 동안 한 번만 쓸 수 있어요.</p>
      <button type="button" onClick={share} className="h-11 w-full rounded-xl bg-accent font-semibold text-accent-ink">
        {copied ? "복사했어요" : "보내기"}
      </button>
    </div>
  );
}
