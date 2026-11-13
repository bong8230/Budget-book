"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatSigned, formatWon } from "@/components/format";
import { undoTransactionAction } from "../actions";

type Added = {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  occurredOn: string;
  categoryName: string | null;
  paymentMethodName: string | null;
  memo: string;
};
type Turn = { role: "user" | "assistant"; text: string; added?: Added[] };
type Status = { enabled: boolean; hasBudget: boolean; capKrw: number; spentKrw: number; remainingKrw: number };

const EXAMPLES = ["13일 마트에서 카드로 3000원 썼어", "이번 달 식비 얼마 썼어?", "지난달보다 많이 쓴 카테고리는?", "이번 주 카페에 쓴 돈 알려줘"];

export function AiChat() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => s && setStatus(s))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    const next: Turn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, text }) => ({ role, text })) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
        added?: Added[];
        usage?: { capKrw: number; spentKrw: number };
      };
      if (data.reply) setTurns([...next, { role: "assistant", text: data.reply, added: data.added }]);
      else setError(data.error ?? "응답을 받지 못했어요");
      if (data.usage && status) setStatus({ ...status, ...data.usage, remainingKrw: Math.max(0, data.usage.capKrw - data.usage.spentKrw) });
      if (data.added?.length) router.refresh();
    } catch {
      setError("인터넷 연결을 확인해주세요");
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    const res = await undoTransactionAction(id).catch(() => ({ ok: false }));
    if (res.ok) {
      setUndone((s) => new Set(s).add(id));
      router.refresh();
    } else setError("되돌리지 못했어요. 내역 화면에서 지워주세요.");
  }

  const disabled = status ? !status.enabled || !status.hasBudget || status.remainingKrw <= 0 : false;

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      {status && (
        <div className="mb-3 rounded-xl bg-surface px-3 py-2 text-xs text-muted">
          {!status.enabled ? (
            "서버에 AI 키가 설정되지 않았어요."
          ) : !status.hasBudget ? (
            <>
              이번 달 예산을 정하면 쓸 수 있어요.{" "}
              <Link href="/settings#budget" className="text-accent">
                예산 정하기
              </Link>
            </>
          ) : (
            <span className="tabular">
              이번 달 AI 한도 {formatWon(status.capKrw)} (남은 예산의 10%) · 사용 {formatWon(status.spentKrw)}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="rounded-2xl bg-surface p-4">
            <p className="font-semibold">무엇이든 물어보거나 기록을 맡기세요</p>
            <p className="mt-1 text-sm text-muted">말로 입력하면 바로 가계부에 추가하고, 지출을 대신 계산해 드려요.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" disabled={disabled} onClick={() => send(e)} className="rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-40">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] whitespace-pre-wrap ${t.role === "user" ? "bg-accent text-accent-ink" : "bg-surface"}`}>
              {t.text}
            </div>
            {t.added?.map((a) => (
              <div key={a.id} className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className={`block ${undone.has(a.id) ? "text-muted line-through" : ""}`}>
                    {a.memo || a.categoryName || "내역"} <b className="tabular">{formatSigned(a.amount, a.type)}</b>
                  </span>
                  <span className="block text-xs text-muted">
                    {a.occurredOn} · {a.categoryName ?? (a.type === "transfer" ? "이체" : "미분류")}
                    {a.paymentMethodName ? ` · ${a.paymentMethodName}` : ""}
                  </span>
                </span>
                {undone.has(a.id) ? (
                  <span className="text-xs text-muted">되돌림</span>
                ) : (
                  <>
                    <Link href={`/transactions/${a.id}`} className="text-xs text-accent">
                      수정
                    </Link>
                    <button type="button" onClick={() => undo(a.id)} className="text-xs text-expense">
                      되돌리기
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}

        {busy && <div className="w-24 animate-pulse rounded-2xl bg-surface px-4 py-2.5 text-sm text-muted">생각 중…</div>}
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 flex gap-2 bg-bg py-2"
      >
        <label htmlFor="ai-input" className="sr-only">
          질문 또는 기록
        </label>
        <input
          id="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          disabled={disabled || busy}
          placeholder={disabled ? "지금은 쓸 수 없어요" : "예: 어제 편의점 4500원"}
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 outline-none focus:border-accent disabled:opacity-50"
        />
        <button type="submit" disabled={disabled || busy || !input.trim()} className="h-12 rounded-xl bg-accent px-5 font-bold text-accent-ink disabled:opacity-40">
          보내기
        </button>
      </form>
    </div>
  );
}
