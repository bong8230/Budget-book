import { createHash } from 'node:crypto';
export function dedupeHash(text: string): string {
  return createHash('sha256').update(text.normalize('NFKC').replace(/\s+/g, ' ').trim()).digest('hex');
}
export function importHash(text: string, source: string, receivedAt?: string): string {
  return dedupeHash(JSON.stringify(receivedAt === undefined ? [text, source] : [text, source, receivedAt]));
}
