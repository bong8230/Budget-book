import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';
import { getMyLedger } from '@/lib/db/queries';
import { csvCell } from '@/lib/export/csv';

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('format') !== 'csv') return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: ledger, error: ledgerError } = await getMyLedger(db);
  if (ledgerError) return NextResponse.json({ error: 'Unable to load ledger' }, { status: 500 });
  if (!ledger) return NextResponse.json({ error: 'Ledger not found' }, { status: 404 });
  const [categories, methods, members] = await Promise.all([
    db.from('categories').select('id,name').eq('ledger_id', ledger.id),
    db.from('payment_methods').select('id,name').eq('ledger_id', ledger.id),
    db.from('ledger_members').select('user_id,display_name').eq('ledger_id', ledger.id),
  ]);
  if (categories.error || methods.error || members.error) return NextResponse.json({ error: 'Unable to load export metadata' }, { status: 500 });
  const categoryNames = new Map((categories.data ?? []).map(c => [c.id, c.name]));
  const methodNames = new Map((methods.data ?? []).map(m => [m.id, m.name]));
  const memberNames = new Map((members.data ?? []).map(m => [m.user_id, m.display_name]));
  const rows: string[] = [['날짜','종류','금액','카테고리','결제수단','가맹점','메모','작성자'].map(csvCell).join(',')];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('transactions').select('occurred_on,type,amount,category_id,payment_method_id,merchant,memo,created_by').eq('ledger_id', ledger.id).order('occurred_on').order('id').range(offset, offset + 999);
    if (error) return NextResponse.json({ error: 'Unable to export transactions' }, { status: 500 });
    for (const row of data ?? []) rows.push([row.occurred_on,row.type,row.amount,categoryNames.get(row.category_id) ?? '',methodNames.get(row.payment_method_id) ?? '',row.merchant,row.memo,memberNames.get(row.created_by) ?? '탈퇴한 사용자'].map(csvCell).join(','));
    if (!data || data.length < 1000) break;
  }
  return new Response(`\uFEFF${rows.join('\r\n')}\r\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="budget-book.csv"', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
}
