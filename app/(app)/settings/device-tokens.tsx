"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type DeviceRow = { id: string; name: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

const dateFmt = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function DeviceTokens({ ledgerId, initial }: { ledgerId: string; initial: DeviceRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ token: string; name: string } | null>(null);

  const active = initial.filter((d) => !d.revoked_at);
  const webhook = typeof window === "undefined" ? "/api/import" : `${window.location.origin}/api/import`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const deviceName = name.trim() || "내 폰";
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ledgerId, name: deviceName }),
    });
    setBusy(false);
    if (!res.ok) return setError("토큰을 만들지 못했어요");
    const { token } = (await res.json()) as { token: string };
    setIssued({ token, name: deviceName });
    setName("");
    router.refresh();
  }

  async function revoke(id: string) {
    if (!confirm("이 기기의 토큰을 폐기할까요? 그 폰에서 보내는 알림은 더 이상 들어오지 않아요.")) return;
    const res = await fetch("/api/devices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) return setError("폐기하지 못했어요");
    router.refresh();
  }

  async function sendTest() {
    if (!issued) return;
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${issued.token}` },
      body: JSON.stringify({ text: "[테스트] 출금 1,000원 가계부 연결 확인", source: "manual" }),
    });
    setError(res.ok ? null : "테스트 전송에 실패했어요");
    if (res.ok) router.push("/inbox");
  }

  return (
    <div className="mt-3 space-y-3">
      {issued && (
        <div className="space-y-2 rounded-xl border border-accent p-3 text-sm">
          <p className="font-semibold">‘{issued.name}’ 토큰이 만들어졌어요</p>
          <p className="text-xs text-expense">이 화면을 떠나면 토큰을 다시 볼 수 없어요. 지금 폰 설정에 붙여 넣으세요.</p>
          <CopyField label="웹훅 주소" value={webhook} />
          <CopyField label="헤더 Authorization" value={`Bearer ${issued.token}`} />
          <div className="flex gap-2">
            <button type="button" onClick={sendTest} className="h-10 flex-1 rounded-xl border border-line font-semibold">
              테스트 보내기
            </button>
            <a href="https://github.com/bong8230/Budget-book/blob/main/docs/IMPORT_SETUP.md" target="_blank" rel="noreferrer" className="grid h-10 flex-1 place-items-center rounded-xl border border-line font-semibold">
              설정 방법
            </a>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {active.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2">
              <span>
                <span className="block">{d.name || "이름 없음"}</span>
                <span className="block text-xs text-muted">
                  {d.last_used_at ? `마지막 수신 ${dateFmt.format(new Date(d.last_used_at))}` : "아직 받은 알림 없음"}
                </span>
              </span>
              <button type="button" onClick={() => revoke(d.id)} className="text-xs text-expense">
                폐기
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="flex gap-2">
        <label htmlFor="device-name" className="sr-only">
          기기 이름
        </label>
        <input
          id="device-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="기기 이름 (예: 내 갤럭시)"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent"
        />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
          토큰 만들기
        </button>
      </form>
      {error && <p className="text-sm text-expense">{error}</p>}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-0.5 w-full rounded-lg bg-surface-2 p-2 text-left font-mono text-xs break-all"
      >
        {value}
        <span className="ml-2 font-sans text-accent">{copied ? "복사됨" : "복사"}</span>
      </button>
    </div>
  );
}
