import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';
export async function POST(request: Request) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { ledgerId?: unknown; subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const s = body.subscription;
  if (typeof s?.endpoint !== 'string' || typeof s.keys?.p256dh !== 'string' || typeof s.keys.auth !== 'string' || s.endpoint.length > 2048 || s.keys.p256dh.length > 256 || s.keys.auth.length > 256) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  let url: URL; try { url = new URL(s.endpoint); } catch { return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 }); }
  if (url.protocol !== 'https:' || !['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) return NextResponse.json({ error: 'Unsupported push endpoint' }, { status: 400 });
  let ledgerId = body.ledgerId;
  if (ledgerId === undefined) { const { data } = await db.from('ledger_members').select('ledger_id').eq('user_id', user.id).limit(1).maybeSingle(); ledgerId = data?.ledger_id; }
  if (typeof ledgerId !== 'string') return NextResponse.json({ error: 'Ledger required' }, { status: 400 });
  const { error } = await db.from('push_subscriptions').upsert({ ledger_id: ledgerId, owner_id: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }, { onConflict: 'endpoint' });
  return NextResponse.json(error ? { error: 'Unable to save subscription' } : { ok: true }, { status: error ? 400 : 200 });
}
export async function DELETE(request: Request) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { endpoint?: unknown }; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.endpoint !== 'string') return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  const { error } = await db.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('owner_id', user.id);
  return NextResponse.json(error ? { error: 'Unable to delete subscription' } : { ok: true }, { status: error ? 500 : 200 });
}
