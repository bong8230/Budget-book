import 'server-only';
import { createClient as createAdmin } from '@supabase/supabase-js';
import webpush from 'web-push';
import { createClient } from '@/lib/db/server';

export type PushPayload = { title: string; body: string; url: string };

/** Server-internal delivery. Failures are isolated from the transaction/import itself. */
export async function notifyUsers(ledgerId: string, userIds: string[], payload: PushPayload): Promise<{ attempted: number; failed: number }> {
  if (!userIds.length) return { attempted: 0, failed: 0 };
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return { attempted: 0, failed: 1 };
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('ledger_id', ledgerId).in('owner_id', userIds);
  if (error || !data) return { attempted: 0, failed: 1 };
  try { webpush.setVapidDetails('mailto:admin@example.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY); } catch { return { attempted: 0, failed: 1 }; }
  const results = await Promise.all(data.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) { await admin.from('push_subscriptions').delete().eq('id', subscription.id); return true; }
      return false;
    }
    return true;
  }));
  return { attempted: data.length, failed: results.filter(result => !result).length };
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

/** Notify the owner only after verifying the pending request belongs to the signed-in requester. */
export async function notifyJoinRequest(requestId: string): Promise<void> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { data: request, error } = await db.from('ledger_join_requests').select('ledger_id,display_name').eq('id', requestId).eq('user_id', user.id).eq('status', 'pending').maybeSingle();
  if (error || !request) return;
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: owners, error: ownerError } = await admin.from('ledger_members').select('user_id').eq('ledger_id', request.ledger_id).eq('role', 'owner');
  if (ownerError || !owners?.length) return;
  await notifyUsers(request.ledger_id, owners.map(owner => owner.user_id), { title: '가계부 참여 요청', body: `${request.display_name}님이 참여를 요청했어요.`, url: '/settings' });
}
