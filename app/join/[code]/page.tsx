import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { getMyJoinRequest, getMyLedger, requestJoin } from "@/lib/db/queries";
import { notifyJoinRequest } from "@/lib/push/notify";

export const metadata = { title: "초대 수락 · 우리집 가계부" };

const ERRORS: Record<string, string> = {
  invite: "초대 링크가 만료됐거나 이미 사용됐어요. 배우자에게 새 링크를 요청해주세요.",
  name: "이름을 입력해주세요.",
  failed: "요청을 보내지 못했어요. 잠시 후 다시 시도해주세요.",
};

async function request(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  const back = `/join/${encodeURIComponent(code)}`;
  if (!name) redirect(`${back}?error=name`);
  const db = await createClient();
  const { data: id, error } = await requestJoin(db, code, name);
  if (error) redirect(`${back}?error=${/invite/i.test(error.message) ? "invite" : "failed"}`);
  if (id) await notifyJoinRequest(String(id)).catch(() => {});
  redirect("/join/waiting");
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
  const db = await createClient();
  const [{ data: ledger }, pending] = await Promise.all([getMyLedger(db), getMyJoinRequest(db).catch(() => null)]);
  if (ledger) redirect("/");
  if (pending?.status === "pending") redirect("/join/waiting");
  const {
    data: { user },
  } = await db.auth.getUser();
  const suggested = (user?.user_metadata?.name as string | undefined) ?? (user?.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">가계부 초대</h1>
      <p className="mt-2 text-muted">
        배우자가 함께 쓰는 가계부에 초대했어요. 참여를 요청하면 가계부를 만든 사람이 승인한 뒤 함께 쓸 수 있어요.
      </p>
      {error && ERRORS[error] && (
        <p role="alert" className="mt-4 rounded-xl bg-surface p-3 text-sm text-expense">
          {ERRORS[error]}
        </p>
      )}
      <form action={request} className="mt-8 space-y-3">
        <input type="hidden" name="code" value={code} />
        <label htmlFor="join-name" className="text-sm text-muted">
          가계부에서 보일 내 이름
        </label>
        <input
          id="join-name"
          name="name"
          required
          maxLength={30}
          defaultValue={suggested.slice(0, 30)}
          placeholder="예: 지영"
          className="h-13 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent"
        />
        <button type="submit" className="h-13 w-full rounded-xl bg-accent font-bold text-accent-ink">
          참여 요청
        </button>
      </form>
    </main>
  );
}
