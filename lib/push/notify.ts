import 'server-only';
import { createClient as createAdmin } from '@supabase/supabase-js';
import webpush from 'web-push';
import { createClient } from '@/lib/db/server';

export type PushPayload = { title: string; body: string; url: string };

/** Server-internal delivery. Failures are isolated from the transaction/import itself. */
export async function notifyUsers(ledgerId: string, userIds: string[], payload: PushPayload): Promise<void> {
  if (!userIds.length || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('ledger_id', ledgerId).in('owner_id', userIds);
  if (error || !data) return;
  try { webpush.setVapidDetails('mailto:admin@example.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY); } catch { return; }
  await Promise.allSettled(data.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id);
    }
  }));
}

/** Called by an authenticated server action after inserting a transaction. */
export async function notifyLedger(ledgerId: string, exceptUserId: string, payload: PushPayload): Promise<void> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user || user.id !== exceptUserId) return;
  const { data: members } = await db.from('ledger_members').select('user_id').eq('ledger_id', ledgerId);
  if (!members?.some(member => member.user_id === user.id)) return;
  await notifyUsers(ledgerId, members.filter(member => member.user_id !== user.id).map(member => member.user_id), payload);
}
