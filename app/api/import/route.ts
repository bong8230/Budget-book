import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { parseNotification } from '@/lib/import/parse';
import { dedupeHash } from '@/lib/import/dedupe';
import { notifyUsers } from '@/lib/push/notify';
import { classifyTransfer, matchPaymentMethod, matchRule } from '@/lib/rules/match';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const hash = createHash('sha256').update(token).digest('hex');
  const { data: device, error } = await db.from('device_tokens').select('id,ledger_id,owner_id,revoked_at').eq('token_hash', hash).maybeSingle();
  if (error || !device || device.revoked_at) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: allowed, error: limitError } = await db.rpc('consume_import_limit', { target_device: device.id });
  if (limitError) return NextResponse.json({ error: 'Unable to check rate limit' }, { status: 503 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  await db.from('device_tokens').update({ last_used_at: new Date().toISOString() }).eq('token_hash', hash).is('revoked_at', null);
  let body: { text?: unknown; source?: unknown; received_at?: unknown };
  const maxBytes = 48_000;
  const size = Number(request.headers.get('content-length') ?? 0);
  if (size > maxBytes) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); return NextResponse.json({ error: 'Request too large' }, { status: 413 }); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 10000 || !['sms', 'notification', 'manual'].includes(String(body.source))) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  if (body.received_at !== undefined && (typeof body.received_at !== 'string' || Number.isNaN(Date.parse(body.received_at)))) return NextResponse.json({ error: 'Invalid received_at' }, { status: 400 });
  const parsed = parseNotification(body.text, body.received_at ? new Date(body.received_at as string) : new Date());
  if (!/입금|출금|결제|승인|사용|취소/.test(body.text)) return NextResponse.json({ status: 'skipped' }, { status: 201 });
  const [{ data: methods, error: methodsError }, { data: rules, error: rulesError }] = await Promise.all([
    db.from('payment_methods').select('*').eq('ledger_id', device.ledger_id).is('archived_at', null).order('created_at').order('id'),
    db.from('rules').select('*').eq('ledger_id', device.ledger_id).order('created_at').order('id'),
  ]);
  if (methodsError || rulesError) return NextResponse.json({ error: 'Unable to load import rules' }, { status: 500 });
  const method = matchPaymentMethod(body.text, methods ?? []);
  const rule = matchRule(body.text, parsed.merchant, rules ?? []);
  const type = classifyTransfer(body.text, rule?.set_type ?? parsed.type);
  const { data: status, error: insertError } = await db.rpc('ingest_import', {
    target_ledger: device.ledger_id, target_owner: device.owner_id, source_value: body.source,
    raw_value: body.text, hash_value: dedupeHash(body.text), amount_value: parsed.amount,
    date_value: parsed.occurred_on, merchant_value: parsed.merchant, type_value: type,
    category_value: type === 'transfer' ? null : rule?.category_id ?? null,
    payment_value: rule?.payment_method_id ?? method?.id ?? null, rule_value: rule?.id ?? null,
    auto_value: Boolean(rule?.auto_accept) && !/취소/.test(body.text),
  });
  if (insertError) return NextResponse.json({ error: 'Unable to save import' }, { status: 500 });
  if (status === 'accepted') {
    const { data: members } = await db.from('ledger_members').select('user_id,display_name').eq('ledger_id', device.ledger_id);
    const name = members?.find(m => m.user_id === device.owner_id)?.display_name ?? '가족';
    const others = (members ?? []).filter(m => m.user_id !== device.owner_id).map(m => m.user_id);
    try { await notifyUsers(device.ledger_id, others, { title: `${name}님이 내역을 입력했어요`, body: `${parsed.amount?.toLocaleString('ko-KR') ?? ''}원${parsed.merchant ? ` · ${parsed.merchant}` : ''}`, url: '/transactions' }); } catch { /* Import remains saved even when push delivery fails. */ }
  }
  if (status !== 'pending') return NextResponse.json({ status }, { status: 201 });
  const { count } = await db.from('imports').select('id', { count: 'exact', head: true }).eq('ledger_id', device.ledger_id).eq('owner_id', device.owner_id).eq('status', 'pending');
  try { await notifyUsers(device.ledger_id, [device.owner_id], { title: '확인 대기 내역', body: `확인 대기 ${count ?? 1}건`, url: '/inbox' }); } catch { /* Import remains saved even when push delivery fails. */ }
  return NextResponse.json({ status: 'pending' }, { status: 201 });
}
