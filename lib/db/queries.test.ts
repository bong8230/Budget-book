import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTransactions, listTransactionsRange } from '@/lib/db/queries';

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
