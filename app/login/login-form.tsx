"use client";

import { useState } from "react";
import { createClient } from "@/lib/db/client";

const KAKAO_ENABLED = process.env.NEXT_PUBLIC_KAKAO_LOGIN === "1";

export function LoginForm({ next }: { next: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [email, setEmail] = useState("");

  async function kakao() {
    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo },
    });
    if (error) setStatus("error");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <div className="mt-8 rounded-2xl bg-surface p-5">
        <p className="font-semibold">메일을 보냈어요</p>
        <p className="mt-1 text-sm text-muted">
          <span className="text-ink">{email}</span> 받은편지함에서 로그인 링크를
          눌러주세요. 홈 화면 앱으로 쓰는 중이라면 링크를 같은 폰에서 여세요.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm text-accent"
        >
          다른 이메일로 받기
        </button>
      </div>
    );
  }

  return (
    <>
      {KAKAO_ENABLED && (
        <div className="mt-8">
          <button
            type="button"
            onClick={kakao}
            disabled={status === "sending"}
            className="h-13 w-full rounded-xl bg-[#FEE500] font-bold text-black/85 disabled:opacity-50"
          >
            카카오로 시작하기
          </button>
          <p className="my-4 text-center text-xs text-muted">또는 이메일로</p>
        </div>
      )}
      <form
        onSubmit={submit}
        className={KAKAO_ENABLED ? "space-y-3" : "mt-8 space-y-3"}
      >
        <label htmlFor="email" className="sr-only">
          이메일
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소"
          className="h-13 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent"
        />
        {status === "error" && (
          <p role="alert" className="text-sm text-expense">
            로그인하지 못했어요. 잠시 후 다시 시도해주세요.
          </p>
        )}
        <button
          type="submit"
          disabled={status === "sending"}
          className="h-13 w-full rounded-xl bg-accent font-bold text-accent-ink disabled:opacity-50"
        >
          {status === "sending" ? "보내는 중…" : "로그인 링크 받기"}
        </button>
      </form>
    </>
  );
}
