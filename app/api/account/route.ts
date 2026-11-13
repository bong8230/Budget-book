import { createClient as createAdmin } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';
export const runtime = 'nodejs';
export async function DELETE() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: 'Unable to delete account' }, { status: 500 });
  await db.auth.signOut();
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
