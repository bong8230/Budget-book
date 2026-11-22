import { LoginForm } from "./login-form";
import { safeNext } from "@/app/_lib/safe-next";

export const metadata = { title: "로그인 · 우리집 가계부" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const { next, error, deleted } = await searchParams;
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">우리집 가계부</h1>
      <p className="mt-2 text-muted">{process.env.NEXT_PUBLIC_KAKAO_LOGIN === "1" ? "카카오로 바로 시작하거나, 이메일로 받은 링크로 로그인하세요." : "이메일로 받은 링크를 누르면 바로 로그인돼요."}</p>
      {deleted && (
        <p role="status" className="mt-4 rounded-xl bg-surface p-3 text-sm">
          탈퇴가 완료됐어요. 그동안 써주셔서 고마워요.
        </p>
      )}
      {error === "link" && (
        <p role="alert" className="mt-4 rounded-xl bg-surface p-3 text-sm text-expense">
          로그인 링크가 만료됐거나 잘못됐어요. 다시 받아주세요.
        </p>
      )}
      <LoginForm next={safeNext(next)} />
    </main>
  );
}
