import { LoginForm } from "./login-form";
import { safeNext } from "@/app/_lib/safe-next";

export const metadata = { title: "로그인 · 우리집 가계부" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">우리집 가계부</h1>
      <p className="mt-2 text-muted">이메일로 받은 링크를 누르면 바로 로그인돼요.</p>
      {error === "link" && (
        <p role="alert" className="mt-4 rounded-xl bg-surface p-3 text-sm text-expense">
          로그인 링크가 만료됐거나 잘못됐어요. 다시 받아주세요.
        </p>
      )}
      <LoginForm next={safeNext(next)} />
    </main>
  );
}
