import { describe, expect, it } from 'vitest';
import { importHash } from '@/lib/import/dedupe';

describe('import retry identity', () => {
  it('keeps repeated messages without received_at stable', () => {
    expect(importHash('승인 3000원', 'sms')).toBe(importHash('승인 3000원', 'sms'));
  });
  it('distinguishes received times and sources', () => {
    expect(importHash('승인 3000원', 'sms', '2026-11-13T01:00:00.000Z')).not.toBe(importHash('승인 3000원', 'sms', '2026-11-13T01:01:00.000Z'));
    expect(importHash('승인 3000원', 'sms')).not.toBe(importHash('승인 3000원', 'notification'));
  });
});
