import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTransactions, listTransactionsRange, renameCategory, deleteCategory, countCategoryUsage } from '@/lib/db/queries';

function makeClient(count: number, failAt?: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: String(i) }));
  const ranges: [number, number][] = [];
  const builder = {
    select() { return this; }, eq() { return this; }, gte() { return this; }, lt() { return this; }, order() { return this; },
    async range(from: number, to: number) {
      ranges.push([from, to]);
      return from === failAt ? { data: null, error: { message: 'DB failure' } } : { data: rows.slice(from, to + 1), error: null };
    },
  };
  return { db: { from: () => builder } as unknown as SupabaseClient, ranges };
}
describe('transaction pagination', () => {
  it('reads past the first 1000 rows', async () => {
    const { db, ranges } = makeClient(1005);
    expect((await listTransactions(db, 'ledger', '2026-11')).data).toHaveLength(1005);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
  it('does not return a partial list when another page fails', async () => {
    const { db } = makeClient(1200, 1000);
    const result = await listTransactionsRange(db, 'ledger', '2026-01', '2026-11');
    expect(result.data).toBeNull(); expect(result.error).toBeTruthy();
  });
});
describe('category operations', () => {
  it('scopes renames and deletes by ledger and preserves DB errors', async () => {
    const duplicate = { code: '23505', message: 'duplicate' };
    const builder = {
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: duplicate }),
    };
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as SupabaseClient;
    expect((await renameCategory(db, 'ledger', 'category', '  식비  ')).error).toEqual(duplicate);
    expect(builder.update).toHaveBeenCalledWith({ name: '식비' });
    expect(builder.eq).toHaveBeenCalledWith('ledger_id', 'ledger');
    expect(builder.eq).toHaveBeenCalledWith('id', 'category');
    builder.eq.mockClear();
    await deleteCategory(db, 'ledger', 'category');
    expect(builder.eq).toHaveBeenCalledWith('ledger_id', 'ledger');
    expect(builder.eq).toHaveBeenCalledWith('id', 'category');
  });
  it('requests category counts within the selected ledger', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ category_id: 'c', count: 2 }], error: null });
    const db = { rpc } as unknown as SupabaseClient;
    expect(await countCategoryUsage(db, 'ledger')).toEqual(new Map([['c', 2]]));
    expect(rpc).toHaveBeenCalledWith('count_category_usage', { target_ledger: 'ledger' });
  });
});
