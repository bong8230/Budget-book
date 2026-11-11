import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { parseNotification } from '@/lib/import/parse';
import { dedupeHash } from '@/lib/import/dedupe';
import { notifyUsers } from '@/lib/push/notify';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const hash = createHash('sha256').update(token).digest('hex');
  const { data: device, error } = await db.from('device_tokens').select('ledger_id,owner_id,revoked_at').eq('token_hash', hash).maybeSingle();
  if (error || !device || device.revoked_at) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await db.from('device_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', hash).is('revoked_at', null);
  let body: { text?: unknown; source?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 10000 || !['sms', 'notification', 'manual'].includes(String(body.source))) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const parsed = parseNotification(body.text);
  if (!/입금|출금|결제|승인|사용|취소/.test(body.text)) return NextResponse.json({ status: 'skipped' }, { status: 201 });
  const { error: insertError } = await db.from('imports').insert({ ledger_id: device.ledger_id, owner_id: device.owner_id, source: body.source, raw_text: body.text, dedupe_hash: dedupeHash(body.text), ...parsed });
  if (insertError?.code === '23505') return NextResponse.json({ status: 'duplicate' }, { status: 201 });
  if (insertError) return NextResponse.json({ error: 'Unable to save import' }, { status: 500 });
  const { count } = await db.from('imports').select('id', { count: 'exact', head: true }).eq('ledger_id', device.ledger_id).eq('owner_id', device.owner_id).eq('status', 'pending');
  try { await notifyUsers(device.ledger_id, [device.owner_id], { title: '확인 대기 내역', body: `확인 대기 ${count ?? 1}건`, url: '/inbox' }); } catch { /* Import remains saved even when push delivery fails. */ }
  return NextResponse.json({ status: 'pending' }, { status: 201 });
}
