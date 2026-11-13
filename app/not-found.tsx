import Link from "next/link";

export default function NotFound() {
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">찾을 수 없어요</h1>
      <p className="mt-2 text-sm text-muted">지워졌거나 이미 처리된 내역일 수 있어요.</p>
      <Link href="/" className="mt-6 grid h-12 w-full place-items-center rounded-xl bg-accent font-bold text-accent-ink">
        홈으로
      </Link>
    </main>
  );
}
