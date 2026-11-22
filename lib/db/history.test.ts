import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { merchantCategoryHistory } from '@/lib/db/queries';

type Row = { merchant: string; category_id: string };
/** rows는 최신순(쿼리의 order와 같은 순서)으로 준다 */
function makeClient(rows: Row[], failAt?: number) {
  const calls: { gte?: [string, string]; lte?: [string, string]; ranges: [number, number][] } = { ranges: [] };
  const builder = {
    select() { return this; }, eq() { return this; }, not() { return this; }, order() { return this; },
    gte(col: string, v: string) { calls.gte = [col, v]; return this; },
    lte(col: string, v: string) { calls.lte = [col, v]; return this; },
    async range(from: number, to: number) {
      calls.ranges.push([from, to]);
      return from === failAt ? { data: null, error: { message: 'DB failure' } } : { data: rows.slice(from, to + 1), error: null };
    },
  };
  return { db: { from: () => builder } as unknown as SupabaseClient, calls };
}

afterEach(() => vi.useRealTimers());

describe('merchantCategoryHistory', () => {
  it('최근 1년, 미래 거래 제외 범위로 한국 날짜 기준 조회', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T16:30:00Z')); // 한국 11/23 01:30
    const { db, calls } = makeClient([]);
    await merchantCategoryHistory(db, 'ledger');
    expect(calls.gte).toEqual(['occurred_on', '2025-11-23']);
    expect(calls.lte).toEqual(['occurred_on', '2026-11-23']);
  });
  it('가게별 최다 카테고리, 동률이면 최신 기록, 이름은 정규화', async () => {
    const { db } = makeClient([
      { merchant: '스타벅스', category_id: 'cafe' },
      { merchant: '스타벅스 ', category_id: 'life' },
      { merchant: 'ＳＴＡＲＢＵＣＫＳ', category_id: 'x' },
      { merchant: '스타벅스', category_id: 'life' },
      { merchant: '이마트', category_id: 'food' },
      { merchant: '이마트', category_id: 'life' },
    ]);
    const map = await merchantCategoryHistory(db, 'ledger');
    expect(map.get('스타벅스')).toBe('life');
    expect(map.get('이마트')).toBe('food');
  });
  it('1000건을 넘으면 다음 쪽도 읽고, 실패하면 예외', async () => {
    const rows = Array.from({ length: 1003 }, (_, i) => ({ merchant: '마트', category_id: i < 1000 ? 'a' : 'b' }));
    const { db, calls } = makeClient(rows);
    expect((await merchantCategoryHistory(db, 'ledger')).get('마트')).toBe('a');
    expect(calls.ranges).toEqual([[0, 999], [1000, 1999]]);
    await expect(merchantCategoryHistory(makeClient(rows, 1000).db, 'ledger')).rejects.toBeTruthy();
  });
});
