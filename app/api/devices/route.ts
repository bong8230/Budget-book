import { randomBytes, createHash } from 'node:crypto';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/db/server';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { ledgerId?: unknown; name?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.ledgerId !== 'string' || typeof body.name !== 'string' || body.name.length > 100) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { data: member } = await db.from('ledger_members').select('user_id').eq('ledger_id', body.ledgerId).eq('user_id', user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const token = randomBytes(32).toString('hex');
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await admin.from('device_tokens').insert({ ledger_id: body.ledgerId, owner_id: user.id, name: body.name, token_hash: createHash('sha256').update(token).digest('hex') }).select('id,name,created_at').single();
  if (error) return NextResponse.json({ error: 'Unable to create device' }, { status: 500 });
  return NextResponse.json({ device: data, token }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
export async function DELETE(request: Request) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { id?: unknown }; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.id !== 'string') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error } = await admin.from('device_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', body.id).eq('owner_id', user.id);
  return NextResponse.json(error ? { error: 'Unable to revoke device' } : { ok: true }, { status: error ? 500 : 200 });
}
