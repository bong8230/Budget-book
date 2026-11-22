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

/** 서버(Vercel, UTC)와 폰이 같은 날짜를 보도록 항상 한국 시간으로 계산한다 */
const seoulDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-11" 형태의 월 키 (한국 시간) */
export function monthKey(date: Date = new Date()): string {
  return seoulDate.format(date).slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
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

/** 한국 시간 기준 오늘 "YYYY-MM-DD" */
export function todayIso(): string {
  return seoulDate.format(new Date());
}
