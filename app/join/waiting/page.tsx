import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/server";
import { getMyJoinRequest, getMyLedger } from "@/lib/db/queries";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "승인 대기 · 우리집 가계부" };

export default async function WaitingPage() {
  const db = await createClient();
  const [{ data: ledger }, request] = await Promise.all([getMyLedger(db), getMyJoinRequest(db).catch(() => null)]);
  if (ledger) redirect("/");
  if (!request) redirect("/onboarding");

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      {request.status === "rejected" ? (
        <>
          <h1 className="text-2xl font-bold">참여가 거절됐어요</h1>
          <p className="mt-2 text-muted">‘{request.ledgerName}’에 참여하지 못했어요. 필요하면 배우자에게 새 초대 링크를 요청하세요.</p>
          <Link href="/onboarding" className="mt-8 grid h-13 place-items-center rounded-xl border border-line font-semibold">
            내 가계부 새로 만들기
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">승인을 기다리고 있어요</h1>
          <p className="mt-2 text-muted">
            ‘{request.ledgerName}’을(를) 만든 사람에게 참여 요청을 보냈어요. 설정 화면에서 승인하면 이 화면이 자동으로 가계부로 바뀌어요.
          </p>
          <p className="mt-8 flex items-center gap-2 text-sm text-muted" role="status">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
            승인 확인 중…
          </p>
          <AutoRefresh seconds={5} />
        </>
      )}
    </main>
  );
}
