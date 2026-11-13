/**
 * 사용자가 직접 쓴 문장에서 금액 후보를 뽑는다.
 * "3000", "3,000원", "3천", "3천500원", "3만5천", "1.5만", "12만 3000" 등을 지원한다.
 * AI가 거래를 '자동' 추가하려면 금액이 여기서 나온 값 중 하나여야 한다.
 * (도구 결과에 섞인 외부 텍스트가 모델을 속여 임의 금액을 기록하는 것을 막기 위함)
 */
const UNIT: Record<string, number> = { 만: 10_000, 천: 1_000, 백: 100 };

export function amountsInText(text: string): Set<number> {
  const found = new Set<number>();
  const group = /(?:\d[\d,]*(?:\.\d+)?\s*(?:만|천|백)?\s*)+/g;
  for (const m of text.normalize("NFKC").matchAll(group)) {
    const value = evaluate(m[0]);
    if (value != null && value > 0 && Number.isSafeInteger(value)) found.add(value);
    // "12만 3000" 처럼 붙은 경우 각 조각도 후보로 (예: "13일 3000원" → 13, 3000)
    for (const part of m[0].trim().split(/\s+/)) {
      const v = evaluate(part);
      if (v != null && v > 0 && Number.isSafeInteger(v)) found.add(v);
    }
  }
  return found;
}

function evaluate(chunk: string): number | null {
  const tokens = [...chunk.replace(/\s+/g, "").matchAll(/(\d[\d,]*(?:\.\d+)?)(만|천|백)?/g)];
  if (tokens.length === 0) return null;
  let total = 0;
  let lastUnit = Infinity;
  for (const [, num, unit] of tokens) {
    const n = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    const u = unit ? UNIT[unit] : 1;
    // 단위는 큰 것에서 작은 것 순서여야 한 금액으로 본다 (3만5천 O, 5천3만 X)
    if (u >= lastUnit) return null;
    lastUnit = u;
    total += Math.round(n * u);
  }
  return total;
}

/** 거래를 기록해 달라는 뜻이 담긴 문장인지 (질문만 한 경우 자동 추가하지 않음) */
export function asksToRecord(text: string): boolean {
  return /(추가|기록|입력|등록|넣어|적어|저장|썼어|썼다|샀어|결제했|냈어|받았어|들어왔)/.test(text);
}
