"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">문제가 생겼어요</h1>
      <p className="mt-2 text-sm text-muted">잠시 후 다시 시도해주세요. 계속되면 앱을 껐다 켜주세요.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">오류 코드 {error.digest}</p>}
      <div className="mt-6 flex w-full gap-2">
        <button type="button" onClick={reset} className="h-12 flex-1 rounded-xl bg-accent font-bold text-accent-ink">
          다시 시도
        </button>
        <Link href="/" className="grid h-12 flex-1 place-items-center rounded-xl border border-line font-semibold">
          홈으로
        </Link>
      </div>
    </main>
  );
}
