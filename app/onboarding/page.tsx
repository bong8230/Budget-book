import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { createLedger, getMyLedger } from "@/lib/db/queries";

export const metadata = { title: "가계부 만들기 · 우리집 가계부" };

async function create(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim() || "우리집 가계부";
  const db = await createClient();
  const { error } = await createLedger(db, name.slice(0, 100));
  if (error) throw new Error("가계부를 만들지 못했어요");
  redirect("/settings?welcome=1");
}

export default async function OnboardingPage() {
  const db = await createClient();
  const { data: ledger } = await getMyLedger(db);
  if (ledger) redirect("/");

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">가계부를 만들어요</h1>
      <p className="mt-2 text-muted">
        만든 뒤 설정에서 배우자에게 초대 링크를 보내면 함께 쓸 수 있어요. 배우자가 이미 만들었다면 받은 초대 링크를 여세요.
      </p>
      <form action={create} className="mt-8 space-y-3">
        <label htmlFor="name" className="text-sm text-muted">
          가계부 이름
        </label>
        <input
          id="name"
          name="name"
          maxLength={100}
          defaultValue="우리집 가계부"
          className="h-13 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent"
        />
        <button type="submit" className="h-13 w-full rounded-xl bg-accent font-bold text-accent-ink">
          만들기
        </button>
      </form>
    </main>
  );
}
