import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { todayIso } from '@/components/format';
import { addTransaction, listCategories, listMembers, listPaymentMethods, listRules, merchantCategoryHistory } from '@/lib/db/queries';
import { notifyUsers } from '@/lib/push/notify';
import { guessCategory } from '@/lib/voice/category';
import { parseVoice } from '@/lib/voice/parse';

const maxBytes = 48_000;
const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, {
  status, headers: status === 429 ? { 'Retry-After': '60' } : undefined,
});

async function readText(request: Request) {
  const tooLarge = () => fail(413, '음성 입력이 너무 길어요.');
  if (Number(request.headers.get('content-length')) > maxBytes) return tooLarge();
  const reader = request.body?.getReader();
  if (reader) {
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); return tooLarge(); }
        chunks.push(value);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof body?.text === 'string' && body.text.length > 10000) return tooLarge();
      if (typeof body?.text === 'string') return body.text as string;
    } catch { /* Malformed body. */ }
  }
  return fail(400, '음성 입력을 읽지 못했어요.');
}

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!token) return fail(401, '기기 토큰을 확인해 주세요.');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const hash = createHash('sha256').update(token).digest('hex');
  const device = await db.from('device_tokens').select('id,ledger_id,owner_id').eq('token_hash', hash).is('revoked_at', null).maybeSingle();
  if (device.error) return fail(503, '기기 정보를 확인하지 못했어요.');
  if (!device.data) return fail(401, '기기 토큰을 확인해 주세요.');
  const { id, owner_id, ledger_id } = device.data;
  const limit = await db.rpc('consume_import_limit', { target_device: id });
  if (limit.error) return fail(503, '잠시 후 다시 시도해 주세요.');
  if (!limit.data) return fail(429, '입력이 너무 많아요. 1분 후 다시 시도해 주세요.');
  const text = await readText(request);
  if (typeof text !== 'string') return text;
  const parsed = parseVoice(text, todayIso());
  if (!parsed) return fail(422, '금액이나 날짜를 확인해 주세요. 예를 들어 마트에서 3천원이라고 말해 주세요.');
  const [categories, rules, methods, members, history] = await Promise.all([
    listCategories(db, ledger_id), listRules(db, ledger_id), listPaymentMethods(db, ledger_id), listMembers(db, ledger_id),
    parsed.merchant ? merchantCategoryHistory(db, ledger_id).catch(() => null) : undefined,
  ]);
  if (categories.error || rules.error || methods.error || members.error || history === null) return fail(503, '가계부 정보를 읽지 못했어요.');
  if (!members.data.some(m => m.user_id === owner_id)) return fail(403, '이 가계부에 기록할 수 없어요.');
  const { categoryId, paymentMethodId } = guessCategory(text, parsed.merchant, parsed.type, categories.data, rules.data, methods.data, history);
  const result = await addTransaction(db, {
    ledger_id, created_by: owner_id, type: parsed.type, amount: parsed.amount, occurred_on: parsed.occurredOn,
    merchant: parsed.merchant, memo: parsed.memo, category_id: categoryId, payment_method_id: paymentMethodId,
  });
  if (result.error) return fail(500, '거래를 저장하지 못했어요.');
  const amount = parsed.amount.toLocaleString('ko-KR');
  const message = `${parsed.merchant ? parsed.merchant + ' ' : ''}${amount}원 ${parsed.type === 'income' ? '수입' : '지출'}로 추가했어요`;
  const others = members.data.filter(m => m.user_id !== owner_id).map(m => m.user_id);
  try {
    await notifyUsers(ledger_id, others, { title: '가족이 거래를 추가했어요', body: message, url: '/transactions' });
  } catch { /* The transaction is already saved. */ }
  return NextResponse.json({ ok: true, message });
}
