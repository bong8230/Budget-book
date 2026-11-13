import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/recurring/cron-auth';
import { notifyUsers } from '@/lib/push/notify';
import type { GeneratedRecurring } from '@/lib/db/queries';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  if (!authorizedCron(request.headers.get('authorization'), secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  const { data, error } = await db.rpc('generate_due_recurring_all', { until_date: today });
  if (error) return NextResponse.json({ error: 'Unable to generate recurring transactions' }, { status: 500 });
  const created = (data ?? []) as GeneratedRecurring[];
  const queued = await db.from('recurring_notification_outbox').select('transaction_id,ledger_id,item_name,amount').order('created_at').limit(1000);
  if (queued.error) return NextResponse.json({ error: 'Transactions created but notification queue could not be loaded', created: created.length }, { status: 500 });
  const entries = queued.data ?? [];
  const ledgers = [...new Set(entries.map(entry => entry.ledger_id))];
  const members = ledgers.length ? await db.from('ledger_members').select('ledger_id,user_id').in('ledger_id', ledgers) : { data: [], error: null };
  if (members.error) return NextResponse.json({ error: 'Transactions created but notification recipients could not be loaded', created: created.length }, { status: 500 });
  let failed = 0;
  for (const entry of entries) {
    try {
      const delivery = await notifyUsers(entry.ledger_id, (members.data ?? []).filter(member => member.ledger_id === entry.ledger_id).map(member => member.user_id), {
        title: '자동 등록', body: `${entry.item_name} ${Number(entry.amount).toLocaleString('ko-KR')}원`, url: '/transactions',
      });
      if (delivery.failed) { failed++; continue; }
      const result = await db.from('recurring_notification_outbox').delete().eq('transaction_id', entry.transaction_id);
      if (result.error) failed++;
    } catch { failed++; }
  }
  return NextResponse.json({ created: created.length, notificationFailures: failed }, { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
