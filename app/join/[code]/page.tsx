import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { joinLedger } from "@/lib/db/queries";

export const metadata = { title: "초대 수락 · 우리집 가계부" };

async function accept(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "");
  const db = await createClient();
  const { error } = await joinLedger(db, code);
  if (error) redirect(`/join/${encodeURIComponent(code)}?error=1`);
  redirect("/");
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">가계부 초대</h1>
      <p className="mt-2 text-muted">배우자가 함께 쓰는 가계부에 초대했어요. 참여하면 서로의 입력이 실시간으로 보여요.</p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-surface p-3 text-sm text-expense">
          초대 링크가 만료됐거나 이미 사용됐어요. 새 링크를 요청해주세요.
        </p>
      )}
      <form action={accept} className="mt-8">
        <input type="hidden" name="code" value={code} />
        <button type="submit" className="h-13 w-full rounded-xl bg-accent font-bold text-accent-ink">
          참여하기
        </button>
      </form>
    </main>
  );
}
