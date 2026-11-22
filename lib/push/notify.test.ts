import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getRequest: vi.fn(), adminCreate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => {
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: mocks.getRequest };
  return query;
} }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.adminCreate }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
import { notifyJoinRequest } from '@/lib/push/notify';

describe('join request notifications', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('does not use service access for an unauthenticated requester', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await notifyJoinRequest('request');
    expect(mocks.adminCreate).not.toHaveBeenCalled();
  });
  it('does not use service access when the pending request is not visible', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id:'user' } } });
    mocks.getRequest.mockResolvedValue({ data: null, error: null });
    await notifyJoinRequest('other-request');
    expect(mocks.adminCreate).not.toHaveBeenCalled();
  });
});
