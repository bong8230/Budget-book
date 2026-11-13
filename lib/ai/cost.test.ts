import { describe, expect, it } from 'vitest';
import { capKrw, costKrw } from '@/lib/ai/cost';
describe('AI budget', () => {
  it('caps AI at 10% of remaining budget', () => {
    expect(capKrw(null, 10)).toBe(0); expect(capKrw(1000, 250)).toBe(75); expect(capKrw(1000, 1001)).toBe(0);
  });
  it('rounds conservative token costs up to whole won', () => {
    expect(costKrw({input:1_000_000,output:1_000_000,cacheCreation:1_000_000,cacheRead:1_000_000},1500)).toBe(55125);
    expect(costKrw({input:1,output:0},1500)).toBe(1);
  });
});
