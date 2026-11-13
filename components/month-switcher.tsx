import Link from "next/link";
import { monthLabel, shiftMonth } from "./format";

/** query: 달을 바꿔도 유지할 다른 검색 조건 (예: "view=calendar") */
export function MonthSwitcher({ month, basePath, query }: { month: string; basePath: string; query?: string }) {
  const extra = query ? `&${query}` : "";
  return (
    <div className="flex items-center justify-between">
      <Link href={`${basePath}?month=${shiftMonth(month, -1)}${extra}`} aria-label="이전 달" className="rounded-full p-2 text-muted active:bg-surface-2">
        <Chevron dir="left" />
      </Link>
      <h1 className="text-lg font-bold">{monthLabel(month)}</h1>
      <Link href={`${basePath}?month=${shiftMonth(month, 1)}${extra}`} aria-label="다음 달" className="rounded-full p-2 text-muted active:bg-surface-2">
        <Chevron dir="right" />
      </Link>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
