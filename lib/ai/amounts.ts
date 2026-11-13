/**
 * AI 자동 기록 게이트.
 * 사용자가 직접 쓴 문장에서 '금액으로 말한 숫자'만 뽑고, 기록을 요청하는 문장인지 판단한다.
 * 자동 추가는 (1) 기록 요청 문장이고 (2) 그 금액을 사용자가 직접 썼고 (3) 그 금액이 아직 쓰이지 않았을 때만.
 * 나머지는 모두 사용자가 눌러야 저장되는 확인 카드로 간다.
 */
const UNIT: Record<string, number> = { 만: 10_000, 천: 1_000, 백: 100 };

/** 숫자 바로 뒤에 오면 금액이 아닌 것으로 보는 말 (날짜·시간·개수 등) */
const NON_AMOUNT_SUFFIX = /^\s*(일|월|년|시|분|초|개|명|번|회|주|살|층|호|%|퍼센트|시간|박|인분|장|권|잔|병)/;

/**
 * 금액 후보 목록 (같은 금액을 두 번 말하면 두 번 들어간다).
 * 금액으로 인정: '원'이 붙었거나, 만·천·백 단위가 있거나, 쉼표가 있거나, 100 이상이면서 날짜·개수 단위가 붙지 않은 숫자.
 */
export function amountCandidates(text: string): number[] {
  const src = text.normalize("NFKC");
  const out: number[] = [];
  const re = /\d[\d,]*(?:\.\d+)?(?:\s*(?:만|천|백)\s*(?:\d[\d,]*(?:\.\d+)?)?)*(?:\s*(?:만|천|백))?/g;
  for (const m of src.matchAll(re)) {
    const raw = m[0].trim();
    const after = src.slice((m.index ?? 0) + m[0].length);
    if (NON_AMOUNT_SUFFIX.test(after)) continue;
    const value = evaluate(raw);
    if (value == null || value <= 0 || !Number.isSafeInteger(value)) continue;
    const hasWon = /^\s*원/.test(after);
    const hasUnit = /[만천백]/.test(raw);
    const hasComma = raw.includes(",");
    if (hasWon || hasUnit || hasComma || value >= 100) out.push(value);
  }
  return out;
}

function evaluate(chunk: string): number | null {
  const tokens = [...chunk.replace(/\s+/g, "").matchAll(/(\d[\d,]*(?:\.\d+)?)(만|천|백)?/g)];
  if (tokens.length === 0) return null;
  let total = 0;
  let lastUnit = Infinity;
  for (const [, num, unit] of tokens) {
    if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(num)) return null;
    const n = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    const u = unit ? UNIT[unit] : 1;
    // 단위는 큰 것에서 작은 것 순서여야 한 금액 (3만5천 O, 5천3만 X)
    if (u >= lastUnit) return null;
    lastUnit = u;
    total += Math.round(n * u);
  }
  return total;
}

/** 질문인지 (질문이면 자동 기록하지 않는다) */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  return /[?？]\s*$/.test(t) || /(얼마|몇|뭐|무엇|언제|어디|누가|왜|어떻게|알려|보여|있어\?|했나|썼나|됐나|인가|일까|나요|니\b|냐\b|까\b|지\s*않)/.test(t);
}

/** 기록을 요청하는 문장인지 */
export function asksToRecord(text: string): boolean {
  if (isQuestion(text)) return false;
  return /(추가|기록|입력|등록|넣어|적어|저장|썼어|썼다|샀어|샀다|결제했|냈어|냈다|받았어|들어왔)/.test(text);
}

/** 후보 금액을 한 번씩만 꺼내 쓰는 바구니 */
export class AmountBudget {
  private left: number[];
  constructor(amounts: number[]) {
    this.left = [...amounts];
  }
  /** 있으면 하나 소비하고 true */
  take(amount: number): boolean {
    const i = this.left.indexOf(amount);
    if (i < 0) return false;
    this.left.splice(i, 1);
    return true;
  }
}
