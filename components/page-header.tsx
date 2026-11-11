import Link from "next/link";

export function PageHeader({ title, back, children }: { title: string; back?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <Link href={back} aria-label="뒤로" className="-ml-2 rounded-full p-2 text-muted active:bg-surface-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
      )}
      <h1 className="flex-1 text-lg font-bold">{title}</h1>
      {children}
    </header>
  );
}
