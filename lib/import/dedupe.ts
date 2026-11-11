import { createHash } from 'node:crypto';
export function dedupeHash(text: string): string {
  return createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, ' ').trim()).digest('hex');
}
