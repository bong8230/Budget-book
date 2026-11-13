import { timingSafeEqual } from 'node:crypto';
export function authorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const provided = Buffer.from(header), expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
