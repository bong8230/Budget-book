import { amountCandidates } from '@/lib/ai/amounts';

const digits = '영일이삼사오육칠팔구';
const units: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };

function spokenNumber(value: string): number | null {
  let total = 0, group = 0, previous = 10000;
  let digit: number | null = null;
  for (const char of value.replace(/\s/g, '')) {
    const n = digits.indexOf(char);
    if (n >= 0) {
      if (digit !== null || n === 0) return null;
      digit = n;
    } else if (char === '만') {
      if (total) return null;
      total = (group + (digit ?? 0) || 1) * 10000;
      group = 0; digit = null; previous = 10000;
    } else {
      const unit = units[char];
      if (!unit || unit >= previous) return null;
      group += (digit ?? 1) * unit;
      digit = null; previous = unit;
    }
  }
  return total + group + (digit ?? 0);
}

function voiceDate(text: string, today: string): string | null {
  const date = new Date(today + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== today) return null;
  const day = text.match(/(?:^|\s)(\d{1,2})\s*일/);
  if (day) {
    const n = Number(day[1]);
    if (n < 1 || n > 31) return null;
    const previous = n > date.getUTCDate();
    date.setUTCDate(1);
    if (previous) date.setUTCMonth(date.getUTCMonth() - 1);
    date.setUTCDate(n);
    if (date.getUTCDate() !== n) return null;
  } else {
    const daysAgo = /그저께|그제/.test(text) ? 2 : /어제/.test(text) ? 1 : 0;
    date.setUTCDate(date.getUTCDate() - daysAgo);
  }
  return date.toISOString().slice(0, 10);
}

function voiceMemo(normalized: string, type: 'income' | 'expense') {
  const memo = normalized
    .replace(/(?:^|\s)(?:오늘|어제|그저께|그제|지금|\d{1,2}\s*일)(?:에는|은|는|에)?(?=\s|[.,!?]|$)/g, ' ')
    .replace(/\d[\d,]*(?:\.\d+)?(?:\s*[만천백](?:\s*\d[\d,]*)?)*(?:\s*원)?(?:으로|을|를|이|만)?/g,
      value => amountCandidates(value).length ? ' ' : value)
    .replace(/(?:^|\s)(?:카드로|현금으로|(?:결제|추가|등록|기록)(?:했어(?:요)?|했다|\s*해\s*줘(?:요)?)?|(?:썼|샀|받았|들어왔)(?:어(?:요)?|다))(?=\s|[.,!?]|$)/g, ' ')
    .replace(/([가-힣])(?:에서|에게|한테|으로|을|를)(?=\s|[.,!?]|$)/g, '$1')
    .replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  return memo.slice(0, 200) || (type === 'income' ? '수입' : '지출');
}

export function parseVoice(text: string, today: string) {
  const clean = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 10000) return null;
  let invalid = false;
  const normalized = clean.replace(/(?<![가-힣\d])([일이삼사오육칠팔구십백천만]+(?:\s+[일이삼사오육칠팔구십백천만]+)*)\s*원/g, (_, word: string) => {
    const amount = spokenNumber(word);
    if (amount === null) invalid = true;
    return amount + '원';
  });
  const amounts = [...new Set(amountCandidates(normalized))];
  const occurredOn = voiceDate(clean, today);
  if (invalid || amounts.length !== 1 || !occurredOn) return null;
  const type: 'income' | 'expense' = /받았|들어왔|입금됐|입금되|월급|용돈\s*받/.test(clean) ? 'income' : 'expense';
  const prefix = clean.match(/(?:^|[.!?,])\s*([^.!?,]*?)에서/)?.[1];
  const merchant = prefix?.replace(/^.*(?:오늘|지금|어제|그저께|그제|\d{1,2}\s*일)(?:에)?\s*/u, '').trim().slice(0, 200) || null;
  const memo = merchant ?? voiceMemo(normalized, type);
  return { amount: amounts[0], type, merchant, occurredOn, memo };
}
