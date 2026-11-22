import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  device: vi.fn(), limit: vi.fn(), save: vi.fn(), notify: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: mocks.device }) }) }) }),
    rpc: mocks.limit,
  }),
}));
vi.mock('@/lib/db/queries', () => ({
  listCategories: async () => ({ data: [] }), listRules: async () => ({ data: [] }),
  listPaymentMethods: async () => ({ data: [] }),
  listMembers: async () => ({ data: [{ user_id: 'owner' }, { user_id: 'partner' }] }),
  addTransaction: mocks.save,
}));
vi.mock('@/lib/push/notify', () => ({ notifyUsers: mocks.notify }));

function request(text: string, authorized = true) {
  return new Request('https://local.test/api/voice', {
    method: 'POST', body: JSON.stringify({ text, ledger_id: 'other', created_by: 'other' }),
    headers: authorized ? { authorization: 'Bearer ' + 'a'.repeat(64) } : {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.device.mockResolvedValue({ data: { id: 'device', ledger_id: 'ledger', owner_id: 'owner' } });
  mocks.limit.mockResolvedValue({ data: true });
  mocks.save.mockResolvedValue({ error: null });
});

it('requires an active device and enforces its rate limit', async () => {
  expect((await POST(request('3천원', false))).status).toBe(401);
  mocks.device.mockResolvedValueOnce({ data: null });
  expect((await POST(request('3천원'))).status).toBe(401);
  mocks.limit.mockResolvedValue({ data: false });
  const limited = await POST(request('3천원'));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('60');
  expect(mocks.save).not.toHaveBeenCalled();
});
it('rejects ambiguous input and oversized streams without writing', async () => {
  expect((await POST(request('3000원 4000원'))).status).toBe(422);
  expect((await POST(request('가'.repeat(17000)))).status).toBe(413);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('saves for the token owner and notifies only the partner, even if push fails', async () => {
  mocks.notify.mockRejectedValue(new Error('push unavailable'));
  const response = await POST(request('지금 마트에서 3천원 결제했어'));
  expect(await response.json()).toEqual({ ok: true, message: '마트 3,000원 지출로 추가했어요' });
  expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amount: 3000, ledger_id: 'ledger', created_by: 'owner' }));
  expect(mocks.notify).toHaveBeenCalledWith('ledger', ['partner'], expect.anything());
});
