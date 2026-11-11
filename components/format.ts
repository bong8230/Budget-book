const won = new Intl.NumberFormat("ko-KR");

/** 12300 → "12,300원" */
export function formatWon(amount: number): string {
  return `${won.format(amount)}원`;
}

/** 지출은 -, 수입은 + 부호를 붙인다. 이체는 부호 없음 */
export function formatSigned(amount: number, type: "income" | "expense" | "transfer"): string {
  if (type === "income") return `+${formatWon(amount)}`;
  if (type === "expense") return `-${formatWon(amount)}`;
  return formatWon(amount);
}

/** "2026-11" 형태의 월 키 */
export function monthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${y}년 ${m}월`;
}

/** "2026-11-11" → "11일 수요일" */
export function dayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(new Date(y, m - 1, d));
  return `${d}일 ${weekday}`;
}

/** 로컬 기준 오늘 "YYYY-MM-DD" */
export function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}
